# Documentación del Pipeline CI/CD — Backend (NestJS API Gateway)

## 1. Arquitectura y Estrategia de Despliegue

El backend de la plataforma DT4FM está construido en NestJS y funciona bajo un patrón arquitectónico de **Backend for Frontend (BFF) / API Gateway**. Su responsabilidad principal es orquestar la lógica de negocio, procesar peticiones y actuar como capa de integración hacia el sistema central de **OpenMAINT** (donde reside la base de datos principal).

Dado que el backend no gestiona una base de datos propia ni ejecuta un ORM (como TypeORM o Prisma), el flujo de despliegue se ha optimizado para ser rápido y seguro.

Se ha implementado una separación estricta de responsabilidades:

* **Integración Continua (CI):** Gestionada por **GitHub Actions**. Se encarga de validar el código, instalar dependencias exactas y asegurar que la compilación de TypeScript sea exitosa antes de autorizar cualquier cambio.
* **Despliegue Continuo (CD):** Gestionado por **Render**. Solo ejecuta el despliegue cuando recibe una señal (Webhook) validada desde GitHub Actions, evitando el riesgo de publicar código defectuoso en producción.

---

## 2. Configuración del Servidor en Render

Para mantener el control del despliegue del lado de GitHub, se ha desactivado el despliegue automático ("Auto-Deploy") en Render. La configuración del Web Service es la siguiente:

| Campo | Valor Configurado | Justificación |
| --- | --- | --- |
| **Root Directory** | `backend` | Define el contexto del monorepo para que Render ubique los archivos correctos. |
| **Build Command** | `npm ci && npm run build` | Garantiza una instalación limpia basada en el `package-lock.json` y compila el código TypeScript. |
| **Pre-Deploy Command** | *(Vacío)* | No se requieren migraciones de base de datos previas al arranque. |
| **Start Command** | `node dist/main.js` | Ejecuta directamente el binario compilado, reduciendo el consumo de RAM frente a `npm run start:prod`. |
| **Auto-Deploy** | `Off` | Cede el control del pipeline a GitHub Actions (Quality Gate). |

---

## 3. Flujo de GitHub Actions

El pipeline está definido en el archivo `.github/workflows/backend-ci-cd.yml` y está diseñado para soportar un flujo de trabajo ágil iterativo (integración en `develop` y producción en `main`).

### Disparadores (Triggers)

El flujo se activa bajo las siguientes condiciones:

* **Eventos:** Push o Pull Request hacia las ramas `main` o `develop`.
* **Filtros de Ruta:** Solo se ejecuta si hay modificaciones dentro del directorio `backend/**` o en el propio archivo YAML. Los cambios exclusivos en el frontend son ignorados por este pipeline.

### Job: Build & Deploy

El pipeline ejecuta un único trabajo con los siguientes pasos secuenciales:

1. **Checkout:** Descarga el código fuente del repositorio.
2. **Setup Node.js:** Configura el entorno de ejecución (Node 20) y habilita la caché de NPM para acelerar futuras ejecuciones.
3. **Install & Build:** Cambia el directorio de trabajo a `./backend`, ejecuta `npm ci` para instalar dependencias y `npm run build` para validar la compilación.
4. **Deploy Hook (Condicional):** Si el código compila correctamente **y** el evento es un *push* directo a la rama `main`, el pipeline ejecuta una petición HTTP POST hacia el Webhook de Render.

### Control de Concurrencia

El pipeline incluye una regla de cancelación en progreso (`cancel-in-progress: true`). Si un desarrollador realiza múltiples *pushes* rápidos a la misma rama, GitHub cancela la ejecución anterior y prioriza la más reciente, optimizando los minutos de cómputo.

---

## 4. Gestión de Secretos y Variables de Entorno

Para que el pipeline funcione y la aplicación arranque correctamente, se requieren configuraciones externas:

### En GitHub Secrets

* `RENDER_DEPLOY_HOOK`: Almacena la URL privada generada por Render. GitHub utiliza este secreto para autorizar y disparar la orden de despliegue.

### En Render (Environment Variables)

Dado que las credenciales no se exponen en el repositorio, las variables necesarias para la conexión con la API de OpenMAINT, generación de JWT y servicios de notificaciones (Nodemailer/Resend) deben inyectarse directamente en la pestaña *Environment* del panel de Render.

A continuación, se detallan las variables de entorno necesarias (configuradas en el archivo `.env`) que el backend necesita para operar correctamente en producción:

| Variable | Descripción | Ejemplo de Valor |
| --- | --- | --- |
| `OPENMAINT_URL` | URL de la API REST de OpenMAINT en producción. | `http://187.77.250.224:8090/cmdbuild/services/rest/v3` |
| `OPENMAINT_USERNAME` | Usuario administrador para autenticación con OpenMAINT. | `admin` |
| `OPENMAINT_PASSWORD` | Contraseña del usuario de OpenMAINT. | *(Secreto)* |
| `HOSTAWAY_CLIENT_ID` | Client ID para la autenticación OAuth 2.0 con Hostaway. | `149703` |
| `HOSTAWAY_CLIENT_SECRET`| Client Secret para Hostaway. | *(Secreto)* |
| `HOSTAWAY_USE_MOCK` | Desactiva/Activa el uso de datos mock en lugar de la API. | `false` (en producción) |
| `HOSTAWAY_SCHEDULER_ENABLED`| Habilita la sincronización diaria automática con Hostaway. | `true` |
| `HOSTAWAY_SCHEDULER_HOUR` | Hora de ejecución (local del servidor) para el scheduler. | `0` (medianoche) |
| `HOSTAWAY_SCHEDULER_MINUTE` | Minuto de ejecución del scheduler. | `0` |
| `MAIL_PROVIDER` | Proveedor del sistema de envío de correos electrónicos. | `smtp` |
| `SMTP_HOST` | Host para el servicio SMTP (Brevo, AWS SES, etc). | `smtp-relay.brevo.com` |
| `SMTP_PORT` | Puerto de conexión para SMTP. | `587` |
| `SMTP_SECURE` | Uso de capa segura (TLS/SSL). | `false` |
| `SMTP_USER` | Usuario de autenticación en el proveedor SMTP. | *(Secreto)* |
| `SMTP_PASSWORD` | Contraseña del usuario SMTP. | *(Secreto)* |
| `SMTP_FROM` | Dirección de remitente por defecto al enviar correos. | `DT4FM <no-reply@dt4fm.com>` |
| `MAIL_THROTTLE_MS` | Control de ritmo para envío de correos (en milisegundos). | `200` |
| `OPENMAINT_TEMPLATE_CLASS`| Nombre de clase en OpenMAINT para guardar plantillas de correo.| `EmailTemplate` |
| `OPENMAINT_OCCUPANCY_OWNER_CODE`| Código del lookup para filtrar destinatarios *owners*. | *(Opcional)* |
| `OPENMAINT_OCCUPANCY_TENANT_CODE`| Código del lookup para filtrar destinatarios *tenants*. | *(Opcional)* |
| `INCIDENT_NOTIFICATION_EMAIL`| Correo administrativo de notificación ante nuevos incidentes. | `admin@dt4fm.com` |

---

