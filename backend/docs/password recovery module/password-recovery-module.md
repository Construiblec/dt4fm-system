# Módulo de Recuperación de Contraseña – Backend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Este documento describe el módulo de **recuperación de contraseña** ("Olvidé mi contraseña") del backend DT4FM.

Permite que un usuario del **personal** que olvidó su contraseña reciba por correo un enlace para elegir una nueva, sin intervención de un administrador. Cubre los roles que entran por `/login`: `MaintOffice` (TPM Equipment), `Supplier`, `SupervisorLimpieza` y `SuperUser`.

**No cubre a los propietarios**, que entran por `/owner/auth` y ya disponen de un cambio de contraseña autenticado desde su perfil (`changeOwnerPassword` en `OwnersService`).

---

## 2. Por qué se construyó a medida

openMAINT **no expone ningún endpoint REST de recuperación de contraseña**. Se verificaron cuatro rutas candidatas y todas responden 404:

```text
POST /sessions/recover_password   → 404
POST /users/recover_password      → 404
POST /utils/recover_password      → 404
POST /password/reset              → 404
```

Lo que sí existe es el recurso `PUT /users/{id}`, que permite cambiar la contraseña usando una sesión administrativa. El backend construye el flujo completo alrededor de esa única operación de escritura.

---

## 3. Arquitectura del flujo

```text
Frontend  /forgot-password
        │
        │ POST /auth/forgot-password  { usernameOrEmail }
        ▼
Backend (NestJS)
        │
        ├─ 1. Sesión de servicio con openMAINT
        │      POST /sessions?scope=service
        │
        ├─ 2. Busca el usuario por Username o Email
        │      GET /classes/User/cards?filter=...
        │
        ├─ 3. Firma un token con el hash de contraseña actual
        │
        ▼
MailerService ──→ Proveedor (Resend / SMTP) ──→ Correo con el enlace
                                                        │
                                                        ▼
                              {APP_BASE_URL}/reset-password?token=...
                                                        │
Frontend  /reset-password ◄─────────────────────────────┘
        │
        │ POST /auth/reset-password  { token, newPassword }
        ▼
Backend
        │
        ├─ 4. Lee el hash actual y valida firma + vigencia
        │      GET /classes/User/cards/{id}
        │
        ├─ 5. Lee la cuenta completa (incluye grupos)
        │      GET /users/{id}
        │
        └─ 6. Escribe la contraseña nueva
               PUT /users/{id}
```

El enlace del correo apunta al **frontend**, no al backend. Por eso `APP_BASE_URL` es la URL de Vercel, no la de Render.

---

## 4. El token: firmado, no almacenado

Es la decisión de diseño central del módulo y conviene entenderla antes de tocar el código.

### 4.1. El problema

Un token de recuperación normalmente se guarda en base de datos con su fecha de expiración. Aquí no había dónde:

* El backend **no tiene base de datos propia**: todo persiste en openMAINT.
* La clase `User` de openMAINT tiene un campo nativo `RecoveryToken`, pero **no es escribible**. `GET /classes/User/attributes` lo reporta como `writable: false`, igual que `Username`, `Password`, `Email` y `Active`; el único atributo escribible de esa clase es `Notes`.
* Guardarlo en memoria no sirve: Render duerme y reinicia la instancia, y el token se perdería antes de usarse.

### 4.2. La solución

El token es **autocontenido y firmado**, y no se guarda en ninguna parte.

```text
token = base64url("userId.expiraEn") + "." + base64url(HMAC)
```

La clave de firma **se deriva del hash de contraseña actual del usuario**:

```text
claveDeFirma = HMAC-SHA256( PASSWORD_RESET_SECRET , hashDeContraseñaActual )
```

De ahí sale la propiedad más importante: **cuando la contraseña cambia, el hash cambia, la firma deja de validar y todos los enlaces emitidos quedan invalidados automáticamente.** Eso da un "un solo uso" real sin almacenar nada.

Es el mismo mecanismo que usa el generador de tokens de recuperación de Django.

### 4.3. Consecuencias prácticas

| Situación | Resultado |
|---|---|
| El usuario usa el enlace | Funciona, y el enlace queda inservible al instante |
| Intenta reutilizar el mismo enlace | Rechazado: la firma ya no valida |
| Pide dos enlaces y usa el segundo | El primero queda invalidado también |
| Cambia su contraseña por otra vía | Cualquier enlace pendiente queda invalidado |
| Se rota `PASSWORD_RESET_SECRET` | Todos los enlaces pendientes quedan invalidados |
| Pasa 1 hora | Rechazado por vigencia |

---

## 5. Estructura de archivos

```text
modules
└ password-recovery
  ├ password-recovery.module.ts
  ├ password-recovery.controller.ts          endpoints y rate limiting
  ├ password-recovery.service.ts             lógica del flujo
  ├ password-recovery.openmaint.service.ts   acceso a openMAINT
  ├ reset-token.service.ts                   firma y validación del token
  ├ rate-limiter.service.ts                  límite en memoria
  ├ dto
  │ ├ forgot-password.dto.ts
  │ └ reset-password.dto.ts
  ├ password-recovery.service.spec.ts
  └ reset-token.service.spec.ts
```

---

## 6. Endpoints

Ambos son **públicos**: no requieren sesión ni cabeceras de autenticación.

### 6.1. Solicitar el enlace

```text
POST /auth/forgot-password
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `usernameOrEmail` | string | Sí | Nombre de usuario o correo registrado en openMAINT |

Respuesta (**siempre 200, siempre idéntica**):

```json
{
  "message": "Si la cuenta existe y tiene un correo registrado, enviaremos un enlace para restablecer la contraseña."
}
```

La respuesta no varía exista o no la cuenta, no tenga correo, falle openMAINT o se supere el límite de peticiones. Cualquier diferencia convertiría el endpoint en un **enumerador de usuarios**.

### 6.2. Restablecer la contraseña

```text
POST /auth/reset-password
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `token` | string | Sí | Token recibido en el enlace del correo |
| `newPassword` | string | Sí | Contraseña nueva, mínimo 8 caracteres |

Respuesta correcta:

```json
{ "message": "Tu contraseña se actualizó correctamente." }
```

Token inválido, vencido o ya usado — HTTP 400:

```json
{
  "message": "El enlace no es válido o ya venció. Solicita uno nuevo desde \"¿Olvidaste tu contraseña?\".",
  "statusCode": 400
}
```

---

## 7. Selección del destinatario

La búsqueda se hace con un filtro `OR` sobre `Username` y `Email` de la clase `User`. Sobre las coincidencias se aplican dos reglas.

**Primero se descartan** las cuentas que no pueden recuperarse: inactivas (`Active = false`), de servicio (`Service = true`), sin correo, o sin contraseña establecida.

**Después se resuelve la ambigüedad.** Un mismo correo puede estar registrado en varias cuentas de openMAINT. Si quedan varias candidatas, solo se procede cuando el texto introducido coincide exactamente con un `Username`; si no, **no se envía nada** y se registra una advertencia.

Esto no es teórico: en la instancia, `usuario.prueba` y `usuario.invitado` comparten dirección de correo. Sin esta regla, alguien que pidiera recuperación con ese correo podría acabar restableciendo la contraseña de `usuario.invitado`, que es la **cuenta compartida del flujo de visitantes**, dejando ese acceso roto para todos.

---

## 8. Preservación de los grupos

`PUT /users/{id}` **reemplaza el recurso completo**. Por eso, antes de escribir, el módulo lee la cuenta con `GET /users/{id}` y reenvía `userGroups` y `defaultUserGroup` tal como estaban.

> **Cuidado al copiar código de `OwnersService`.** Su método `changeOwnerPassword` hardcodea el grupo `Propietarios` en esos dos campos. Es correcto para propietarios, pero replicarlo aquí **borraría los grupos del personal**, que suele pertenecer a varios: `usuario.prueba`, por ejemplo, tiene `Guest`, `MaintOffice` y `Team`.
>
> Hay un test dedicado a esto en `password-recovery.service.spec.ts`.

---

## 9. Seguridad

| Medida | Implementación |
|---|---|
| Sin enumeración de usuarios | Respuesta genérica idéntica en todos los casos |
| Token no adivinable | HMAC-SHA256 con secreto de servidor |
| Comparación sin fugas de tiempo | `crypto.timingSafeEqual` |
| Vigencia | 1 hora |
| Un solo uso | La firma depende del hash de contraseña |
| Fuerza bruta sobre el token | 20 intentos por IP y hora → HTTP 429 |
| Abuso del envío de correo | 10 solicitudes por IP y hora, 5 por cuenta y hora |
| Contraseña débil | Mínimo 8 caracteres, validado en el DTO |

El límite en `forgot-password` **no responde 429**: devuelve el mismo mensaje genérico, porque un error distinto delataría que la cuenta existe.

El limitador vive en memoria (`rate-limiter.service.ts`). Se reinicia con la instancia y no se comparte entre réplicas; para frenar abuso casual y proteger la cuota de envío es suficiente. Si el servicio escala, ese archivo es el único punto a cambiar.

---

## 10. Configuración

```env
# URL pública del FRONTEND, para construir el enlace del correo. Sin barra final.
#   local      http://localhost:5173
#   staging    https://dt4fm-staging.vercel.app
#   producción https://dt4fm-system-f7cc.vercel.app
APP_BASE_URL=http://localhost:5173

# Secreto de firma. Cadena larga y aleatoria, DISTINTA por ambiente.
PASSWORD_RESET_SECRET=
```

Generar el secreto:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

**Si falta `PASSWORD_RESET_SECRET`, la recuperación queda deshabilitada** y se registra un error al arrancar. El resto del backend sigue funcionando con normalidad.

Usar un secreto distinto por ambiente evita que un enlace generado en staging funcione en producción.

El módulo también depende de que el correo esté configurado; ver el documento del [módulo de notificaciones](../notifications%20module/notifications-module.md).

---

## 11. Limitación conocida

Los usuarios de openMAINT **sin el atributo `Email` no pueden recuperar su contraseña**. El flujo responde el mensaje genérico, pero nunca llega el correo.

En la instancia hay seis en esa situación: `wilson.haro`, `micaela.saavedra`, `erick.ontaneda`, `diana.loza`, `rosa.gaona` y `usuario.proveedor`. Se resuelve llenándoles el campo `Email` desde la administración de openMAINT, no desde el código.

---

## 12. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Usuario inexistente | Respuesta genérica; no se envía correo |
| Usuario sin correo | Respuesta genérica; se registra en el log |
| Varias cuentas con el mismo correo | Respuesta genérica; advertencia en el log |
| openMAINT no responde | Respuesta genérica; el error queda en el log |
| Falla el envío del correo | Respuesta genérica; el error queda en el log |
| `PASSWORD_RESET_SECRET` ausente | `forgot-password` no hace nada; `reset-password` responde 400 |
| Token inválido, vencido o usado | HTTP 400 con mensaje uniforme |
| Contraseña menor a 8 caracteres | HTTP 400 con el detalle de validación |

Todos los caminos de `forgot-password` terminan en la misma respuesta. El detalle real solo existe en los logs del servidor.

---

## 13. Pruebas

Dos suites, 20 casos:

* `reset-token.service.spec.ts` – emisión y validación, invalidación al cambiar la contraseña, expiración, firma manipulada, secreto distinto, entradas basura.
* `password-recovery.service.spec.ts` – envío del enlace, respuesta idéntica con y sin usuario, usuario sin correo, cuentas inactivas y de servicio, correo compartido por dos cuentas, fallo de openMAINT, **preservación de los grupos**, token reutilizado y cuenta desactivada.

```bash
npm test -- --testPathPatterns "password-recovery|reset-token"
```

Para la prueba de extremo a extremo conviene apuntar el `.env` local a la instancia clon de openMAINT y usar un usuario cuyo `Email` sea el propio, de modo que el correo de prueba no le llegue a nadie más.
