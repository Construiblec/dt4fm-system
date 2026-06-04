# Módulo de Notificaciones por Correo – Backend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Este documento describe el módulo de **notificaciones por correo** del backend DT4FM.

El módulo permite que un administrador envíe **comunicados masivos** por correo electrónico a los habitantes registrados en openMAINT (clase `Tenant`), usando **plantillas reutilizables** que él mismo gestiona.

El caso de uso inicial es el envío manual ("enviar ahora") de un comunicado a un grupo de destinatarios. El módulo está diseñado para que, sobre la misma base, se puedan añadir nuevos tipos de notificación (por ejemplo, avisar la generación de un pago) con un esfuerzo mínimo.

El backend sigue actuando como **capa de integración**: lee las plantillas y los destinatarios desde openMAINT, y delega el envío real a un proveedor SMTP externo.

---

## 2. Objetivos de diseño

El módulo se construyó sobre tres principios:

* **Proveedor de correo intercambiable.** Cambiar de servidor SMTP (Mailtrap, Brevo, Amazon SES, Gmail) no requiere tocar código, solo variables de entorno.
* **Motor de envío aislado.** La lógica de envío está separada de la lógica de negocio, de modo que cuando el volumen crezca se pueda introducir una cola de mensajes sin reescribir el resto.
* **Extensible a nuevos tipos de notificación.** Añadir un nuevo comunicado (pagos, avisos, recordatorios) reutiliza el motor de envío y el renderizador de plantillas existentes.

---

## 3. Arquitectura del flujo

El envío masivo sigue la arquitectura desacoplada del sistema.

```text
Página personalizada de openMAINT
        │
        │ POST /notifications/bulk
        ▼
Backend (NestJS)
        │
        ├─ 1. Trae la plantilla desde openMAINT
        │      GET /classes/EmailTemplate/cards/{templateId}
        │
        ├─ 2. Resuelve los destinatarios desde openMAINT
        │      GET /classes/Tenant/cards?filter=...
        │
        ├─ 3. Renderiza asunto y cuerpo por destinatario
        │      (reemplazo de variables {{...}})
        │
        ▼
Proveedor SMTP (Mailtrap / Brevo / SES ...)
        │
        ▼
Correo entregado a cada destinatario
```

El frontend y la página personalizada **nunca se comunican directamente con el servidor SMTP**. Todo pasa por el backend.

---

## 4. Capas del módulo

El módulo está organizado en tres capas con responsabilidades bien separadas.

### 4.1. Capa de transporte (proveedor de correo)

Define **cómo** se envía un correo, sin conocer su contenido ni su origen.

* `mail/mail-provider.interface.ts` – Contrato `MailProvider` que todo proveedor debe implementar, más los tipos `MailMessage` y `MailSendResult`, y el token de inyección `MAIL_PROVIDER`.
* `mail/smtp-mail.provider.ts` – Implementación SMTP basada en **nodemailer**. Sirve para cualquier servidor SMTP cambiando únicamente las credenciales.

### 4.2. Capa de envío (motor)

Toma uno o varios mensajes ya construidos y los envía con control de ritmo.

* `mail/mailer.service.ts` – `MailerService`. Expone `sendOne`, `sendBulk` y `verifyProvider`. No conoce plantillas ni openMAINT.

### 4.3. Capa de negocio

Orquesta el caso de uso completo.

* `notifications.service.ts` – `NotificationsService`. Trae la plantilla, resuelve los destinatarios según el alcance, arma las variables y delega el envío.
* `template-renderer.service.ts` – `TemplateRenderer`. Reemplaza marcadores `{{variable}}` en asunto y cuerpo.
* `recipient-scope.enum.ts` – Enum `RecipientScope` (`all`, `owners`, `tenants`).
* `notifications.controller.ts` – Endpoints HTTP.
* `notifications.module.ts` – Ensamblado del módulo y selección del proveedor.

---

## 5. Estructura de archivos

```text
modules
└ notifications
  ├ notifications.module.ts
  ├ notifications.controller.ts
  ├ notifications.service.ts
  ├ template-renderer.service.ts
  ├ recipient-scope.enum.ts
  ├ dto
  │ └ send-bulk.dto.ts
  └ mail
    ├ mail-provider.interface.ts
    ├ smtp-mail.provider.ts
    └ mailer.service.ts
```

Flujo interno:

```text
NotificationsController
        ↓
NotificationsService ──→ OpenmaintClient ──→ openMAINT API
        ↓
TemplateRenderer
        ↓
MailerService
        ↓
MailProvider (SMTP)
        ↓
Servidor SMTP externo
```

---

## 6. Endpoints del backend

### 6.1. Envío masivo

```text
POST /notifications/bulk
```

Tipo de request: `application/json`

Body:

| Campo        | Tipo                       | Obligatorio | Descripción                                                  |
| ------------ | -------------------------- | ----------- | ------------------------------------------------------------ |
| `scope`      | string (`all`/`owners`/`tenants`) | Sí   | A quién se envía el comunicado                               |
| `templateId` | string                     | Sí          | ID de la card de plantilla en openMAINT                      |
| `extraVars`  | objeto `{ clave: valor }`  | No          | Variables globales adicionales para el render de la plantilla |

Ejemplo:

```json
{
  "scope": "owners",
  "templateId": "12",
  "extraVars": {
    "periodo": "Marzo 2026"
  }
}
```

Respuesta:

```json
{
  "total": 8,
  "sent": 7,
  "failed": 1,
  "results": [
    { "to": "ana@example.com", "success": true, "messageId": "<...>" },
    { "to": "luis@example.com", "success": false, "error": "Invalid recipient" }
  ],
  "template": "COMUNICADO_GENERAL"
}
```

### 6.2. Verificación del proveedor de correo

```text
GET /notifications/mail/health
```

Comprueba que el servidor SMTP configurado responda correctamente.

Respuesta:

```json
{ "ok": true }
```

---

## 7. Resolución de destinatarios

Los destinatarios se leen de la clase `Tenant` de openMAINT. El alcance (`scope`) se traduce en un filtro sobre el atributo lookup `OccupancyType`.

| scope    | Filtro aplicado                                              |
| -------- | ----------------------------------------------------------- |
| `all`    | Sin filtro: todos los Tenant                                |
| `owners` | `OccupancyType = OPENMAINT_OCCUPANCY_OWNER_CODE`            |
| `tenants`| `OccupancyType = OPENMAINT_OCCUPANCY_TENANT_CODE`          |

Los códigos del lookup **no están escritos en el código**: se configuran por variables de entorno para no acoplar el backend a los IDs concretos de la instancia de openMAINT. Si no se configuran, el envío va a todos los Tenant y se registra una advertencia en el log.

Antes de enviar, la lista de destinatarios se procesa:

* Se descartan los correos vacíos o con formato inválido.
* Se **deduplica por correo**, de modo que un mismo email nunca recibe el comunicado dos veces.

---

## 8. Plantillas y variables

Las plantillas se guardan como cards en una clase custom de openMAINT (por defecto `EmailTemplate`, configurable). Los atributos mínimos que el backend espera son:

| Atributo  | Tipo   | Uso                                  |
| --------- | ------ | ------------------------------------ |
| `Code`    | String | Identificador legible de la plantilla |
| `Subject` | String | Asunto del correo                    |
| `Body`    | String | Cuerpo del correo (HTML)             |

El asunto y el cuerpo admiten marcadores de la forma `{{variable}}`, que el `TemplateRenderer` reemplaza por destinatario.

Variables disponibles automáticamente por destinatario:

| Variable     | Origen                          |
| ------------ | ------------------------------- |
| `{{nombre}}` | Atributo `Description` del Tenant |
| `{{email}}`  | Atributo `Email` del Tenant     |

Además, cualquier clave enviada en `extraVars` queda disponible como variable global (igual para todos los destinatarios).

Ejemplo de plantilla:

```text
Asunto: Comunicado para {{nombre}}
Cuerpo: Estimado/a {{nombre}}, le informamos sobre el periodo {{periodo}}.
```

Los marcadores sin valor se reemplazan por cadena vacía para no dejar texto crudo en el correo.

---

## 9. Configuración (variables de entorno)

```env
# Proveedor de correo activo (por ahora solo "smtp")
MAIL_PROVIDER=smtp

# Configuración SMTP
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=usuario_smtp
SMTP_PASSWORD=password_smtp
SMTP_FROM=DT4FM <no-reply@example.com>

# Pausa en milisegundos entre cada envío del lote
MAIL_THROTTLE_MS=200

# Clase de plantillas en openMAINT
OPENMAINT_TEMPLATE_CLASS=EmailTemplate

# Códigos del lookup OccupancyType para filtrar destinatarios
OPENMAINT_OCCUPANCY_OWNER_CODE=
OPENMAINT_OCCUPANCY_TENANT_CODE=
```

Ejemplos de configuración SMTP por proveedor:

| Proveedor | SMTP_HOST                 | SMTP_PORT | SMTP_SECURE |
| --------- | ------------------------- | --------- | ----------- |
| Mailtrap  | sandbox.smtp.mailtrap.io  | 2525      | false       |
| Brevo     | smtp-relay.brevo.com      | 587       | false       |
| Amazon SES| email-smtp.\<region\>.amazonaws.com | 587 | false   |

---

## 10. Dependencias

El módulo requiere **nodemailer**. Instalación (en la carpeta `backend`):

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

---

## 11. Cómo cambiar de proveedor de correo

Hay dos escenarios:

**Mismo transporte SMTP, otro servidor** (Mailtrap → Brevo, etc.): solo se cambian las variables de entorno `SMTP_*`. No se toca código.

**Transporte distinto** (por ejemplo, usar el SDK/API nativa de un proveedor en lugar de SMTP):

1. Crear una clase nueva en `mail/` que implemente la interfaz `MailProvider`.
2. Añadir un `case` en el factory `mailProviderFactory` de `notifications.module.ts`.
3. Seleccionarla con la variable `MAIL_PROVIDER`.

Ningún otro archivo del módulo necesita cambiar.

---

## 12. Cómo añadir un nuevo tipo de notificación

El caso "notificar la generación de un pago" (u otros) reutiliza la infraestructura existente:

1. Añadir un método en `NotificationsService` (por ejemplo `notifyPaymentGenerated`).
2. Dentro de él, construir las variables propias del caso (monto, periodo, unidad, etc.).
3. Renderizar la plantilla con `TemplateRenderer` y enviar con `MailerService`.

No se crea infraestructura nueva: el motor de envío, el proveedor y el renderizador ya están disponibles.

---

## 13. Escalabilidad

Para el volumen actual (decenas de destinatarios), el envío secuencial con una pequeña pausa entre correos es robusto y suficiente. La pausa (`MAIL_THROTTLE_MS`) evita que los proveedores gratuitos apliquen límites de tasa o marquen el tráfico como abuso.

Cuando el volumen crezca a cientos o miles de destinatarios, el punto de cambio es **únicamente** el método `sendBulk` de `MailerService`: ahí se sustituye el bucle por el encolado en un sistema de colas (por ejemplo BullMQ con Redis), procesando los envíos por workers. La capa de negocio (`NotificationsService`), los proveedores y el renderizador permanecen sin cambios.

---

## 14. Manejo de errores

| Situación                              | Comportamiento                                                        |
| -------------------------------------- | --------------------------------------------------------------------- |
| Plantilla inexistente                  | HTTP 404 – "La plantilla no existe"                                   |
| Error al consultar openMAINT           | HTTP 500 – mensaje genérico; el detalle queda en el log               |
| Sin destinatarios válidos              | Respuesta exitosa con `total: 0`; se registra una advertencia          |
| Fallo de envío a un destinatario       | No detiene el lote; se marca `success: false` con el motivo en `results` |
| Proveedor SMTP no responde             | `GET /mail/health` devuelve `{ "ok": false }`                          |

El envío masivo es **tolerante a fallos parciales**: si un destinatario falla, el resto se sigue enviando y el resultado individual se reporta en `results`.

---

## 15. Ventajas de la implementación

Este diseño proporciona:

* separación clara entre la lógica de negocio, el motor de envío y el transporte
* proveedor de correo intercambiable por configuración
* base lista para escalar a colas sin reescritura
* reutilización directa para nuevos tipos de notificación
* tolerancia a fallos parciales en el envío masivo
* coherencia con la arquitectura modular del resto del backend
