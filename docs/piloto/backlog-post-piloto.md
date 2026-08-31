# Backlog Post-Piloto

Lista abierta el **2026-08-31** junto con el congelamiento de `v0.1.0-rc1`.

Su función, según el **5.2** del procedimiento, es evitar que el GDGI se quede indefinidamente en estado de prototipo: a partir del congelamiento **no se incorporan funcionalidades nuevas**, y todo lo que aparezca durante la certificación o el piloto entra aquí en vez de al código.

---

## Cómo se clasifica lo que entra

Todo hallazgo o petición se etiqueta con **dos** cosas: su severidad y su naturaleza.

### Severidad — 16

| | | Tratamiento |
|---|---|---|
| **P1** | Impide operar o compromete información | Atención inmediata. Bloquea el piloto |
| **P2** | Una función importante falla, pero hay alternativa | Corrección prioritaria |
| **P3** | Problema funcional que no impide trabajar | Entra en la próxima versión |
| **P4** | Detalle visual o mejora menor | Backlog |
| **RF** | Funcionalidad nueva pedida por el cliente | Backlog de producto |

### Naturaleza — 23

| | |
|---|---|
| **A** | Corrección del producto: se incorpora al GDGI |
| **B** | Mejora general: entra al road map |
| **C** | Configuración específica del cliente: **no debe convertirse en código** si se resuelve configurando |
| **D** | Desarrollo particular: se evalúa aparte |

La clasificación **C** es la que más protege el producto. Sin ella, cada petición del cliente termina siendo una rama de código y el GDGI se convierte en un software distinto por cada cliente.

---

## Regla de admisión durante la certificación

Dentro de la quincena de certificación **solo se corrigen P1 y P2**. Todo lo demás se anota aquí y se queda aquí, aunque sea barato de arreglar. Es la regla que evita que la certificación se convierta en otra ronda de desarrollo.

---

## Abierto al congelamiento

Cuatro defectos conocidos, heredados del estado del prototipo. Los cuatro son la puerta de entrada del D3: la certificación no empieza a medir hasta cerrarlos.

| ID | Sev. | Nat. | Asunto | Estado |
|---|---|---|---|---|
| BP-001 | **P1** | A | Los endpoints de propietarios no exigen sesión. La identidad sale de un número en la URL, y los números son secuenciales: se puede leer el estado de cuenta de cualquier residente sin iniciar sesión. El endpoint de registro de pago además ignora el identificador de la ruta | **Cerrado parcialmente — ver abajo** |
| BP-002 | **P1** | A | CORS refleja cualquier `Origin` recibido y responde `Allow-Credentials: true`. Cualquier sitio puede llamar a la API desde el navegador de un usuario con sesión abierta | Pendiente |
| BP-003 | **P2** | A | El rol se valida contra la cabecera `x-role`, que el frontend toma de `localStorage`. Un usuario autenticado puede enviar el rol que quiera. Afecta a limpieza y a supervisión de mantenimiento | Pendiente |
| BP-004 | **P2** | A | No existe procedimiento de rollback escrito. El caso sin resolver es revertir una versión que ya aplicó una migración: deshacer el código no deshace el esquema | Pendiente |

### BP-001 · avance del 2026-08-31

**Hecho:**

- `OwnersIdentityService` resuelve la identidad del residente desde su sesión de openMAINT —nunca desde la URL—, con caché de 5 minutos porque resolver la ficha `Tenant` cuesta dos llamadas.
- `OwnerSessionGuard` exige sesión y comprueba que el `:tenantId` o `:userId` de la ruta sea el de quien llama. Cubierto por 12 pruebas unitarias.
- Aplicado a los **8 endpoints** que exponen datos de una persona concreta. Los públicos por diseño (login, registro, verificación, edificios, áreas comunes) siguen sin pedir sesión.
- Frontend: interceptor en `authApi` que adjunta la sesión, y la subida de comprobante pasa a usarlo en vez de `axios` suelto.

**Verificado el 2026-08-31:** suite E2E ejecutada contra Postgres real — **21/21 en verde**, incluidos los 8 casos nuevos (401 sin sesión, 403 al tenant ajeno, 403 sin ficha de propietario, 401 con sesión inválida). Las 15 suites del backend pasan completas (145/145, 2 `it.todo` intencionales).

**Pendiente:**

1. **Comprobar contra el servidor desplegado** que el acceso anónimo ya no funciona. La detección original fue por lectura de código y la corrección se verificó en local; falta la confirmación en Render.
2. **Propiedad del pago en el comprobante.** `POST /owners/payments/:paymentId/voucher` ya exige sesión, pero no verifica que el pago sea de quien lo sube: la ruta no lleva `tenantId`. Hay que resolver el propietario del pago desde openMAINT y compararlo. Es el resto de BP-001.
3. **Rutas `/owners/me/...`.** Hoy se conserva el identificador en la URL para no romper el frontend, pero ya no es una credencial. Migrar a rutas sin identificador elimina la comparación por completo.

---

## Funcionalidad congelada

Trabajo terminado o en curso que **no entra** en la RC1 por aplicación del 5.2.

| ID | Nat. | Asunto | Origen |
|---|---|---|---|
| BP-005 | B | Mejora del filtro de reservas de áreas comunales | Rama `feature/reserva-filtro`, un commit sin fusionar al momento del congelamiento |

> Si se decide incluirla en la RC1, debe fusionarse **antes** de empujar el tag y salir de esta lista. Ver la nota de decisión en el acta de congelamiento.

---

## Mejoras detectadas, sin bloquear

Salidas de la revisión técnica previa. Ninguna impide certificar.

| ID | Sev. | Nat. | Asunto |
|---|---|---|---|
| BP-006 | P3 | A | `.gitignore` no cubre `node_modules`: 584 de 975 archivos versionados provienen de la carpeta de documentación de Hostaway |
| BP-007 | P3 | A | `backend/.env.example` contiene lo que parecen credenciales reales (`admin`, contraseña de cuatro dígitos) apuntando a una IP concreta, en vez de valores de ejemplo |
| BP-008 | P4 | A | Quedan en el repositorio `backend/typescript-errors.txt` con errores de compilación y un `sid.tmp` vacío en la raíz |
| BP-009 | P4 | A | `console.log('complete incident')` olvidado en el controlador de incidencias |
| BP-010 | P3 | A | El paso de lint del frontend lleva `continue-on-error`, así que el gate de calidad no bloquea nada |
| BP-011 | P3 | B | El `/health` no expone versión de aplicación, solo el SHA del commit. Convendría añadir la versión semántica al declarar la v1.0 |

---

## Cobertura de pruebas pendiente

| ID | Nat. | Asunto |
|---|---|---|
| BP-012 | A | Dos `it.todo()` marcados en las suites de limpieza y supervisión, a la espera de que el rol se resuelva desde la sesión (BP-003). Al corregirse, se convierten en pruebas reales |
| BP-013 | B | El frontend no tiene pruebas automatizadas de ningún tipo. Fuera del alcance de la certificación, pero es el hueco más grande que queda |

---

## Añadidos durante la certificación

_Vacío. Se completa entre el D1 y el D10._

| ID | Sev. | Nat. | Asunto | Origen | Fecha |
|---|---|---|---|---|---|

---

## Añadidos durante el piloto

_Vacío. Se completa durante las dos semanas de operación controlada del 15._

| ID | Sev. | Nat. | Asunto | Origen | Fecha |
|---|---|---|---|---|---|
