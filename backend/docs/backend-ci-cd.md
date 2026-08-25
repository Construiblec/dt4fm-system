# Documentación del Pipeline CI/CD — Backend (NestJS API Gateway)

## 1. Arquitectura y Estrategia de Despliegue

El backend de la plataforma DT4FM está construido en NestJS y funciona bajo un patrón arquitectónico de **Backend for Frontend (BFF) / API Gateway**. Su responsabilidad principal es orquestar la lógica de negocio, procesar peticiones y actuar como capa de integración hacia el sistema central de **OpenMAINT** (donde reside la base de datos principal).

Desde la implementación de las notificaciones push, el backend **sí gestiona una base de datos propia** (PostgreSQL en Neon, vía TypeORM) para las suscripciones, el historial de avisos y la idempotencia de los procesos programados. openMAINT sigue siendo el sistema de registro de todo lo demás. Eso añade un paso al despliegue: las migraciones se aplican antes de que la versión nueva reciba tráfico. La puesta en marcha y el mantenimiento de Neon están en [neon-postgres.md](neon-postgres.md).

Se ha implementado una separación estricta de responsabilidades:

* **Integración Continua (CI):** Gestionada por **GitHub Actions**. Se encarga de validar el código, instalar dependencias exactas y asegurar que la compilación de TypeScript sea exitosa antes de autorizar cualquier cambio.
* **Despliegue Continuo (CD):** Gestionado por **Render**. Solo ejecuta el despliegue cuando recibe una señal (Webhook) validada desde GitHub Actions, evitando el riesgo de publicar código defectuoso en producción.

---

## 2. Configuración de los Servicios en Render

Hay **dos Web Services**, uno por entorno: producción (desde `main`) y desarrollo (desde `develop`). Cada uno apunta a su propia instancia de openMAINT y a su propia rama de Neon.

Para mantener el control del despliegue del lado de GitHub, se ha desactivado el despliegue automático ("Auto-Deploy") en ambos. La configuración es la siguiente:

| Campo | Producción | Desarrollo | Justificación |
| --- | --- | --- | --- |
| **Root Directory** | `backend` | `backend` | Define el contexto del monorepo para que Render ubique los archivos correctos. |
| **Build Command** | `npm ci && npm run build` | igual | Instalación limpia desde `package-lock.json` y compilación de TypeScript. |
| **Pre-Deploy Command** | `npm run migration:run:prod` | *(no disponible)* | Aplica las migraciones antes de que la versión nueva reciba tráfico. Si falla, aborta el despliegue y la versión anterior sigue sirviendo. |
| **Start Command** | `node dist/main.js` | `npm run migration:run:prod && node dist/main.js` | El binario compilado consume menos RAM que `npm run start:prod`. En desarrollo el arranque carga además las migraciones, porque ese plan no ofrece *Pre-Deploy Command*. |
| **Auto-Deploy** | `Off` | `Off` | Cede el control del pipeline a GitHub Actions (Quality Gate). |

El *Pre-Deploy Command* es una prestación de los planes de pago de Render. El servicio de desarrollo no lo tiene, así que allí las migraciones se encadenan al arranque. La diferencia práctica: si una migración falla en producción el despliegue se aborta y la versión anterior sigue en pie, mientras que en desarrollo el servicio entra en ciclo de reinicio. Es un compromiso aceptable en un entorno de pruebas, y el fallo se ve de inmediato en los registros.

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
4. **Deploy Hook (Condicional):** Si el código compila correctamente **y** el evento es un *push* directo, el pipeline dispara el Webhook del entorno que corresponde a la rama: `main` despliega producción y `develop` despliega staging. Los *pull requests* solo compilan, nunca despliegan.

### Control de Concurrencia

El pipeline incluye una regla de cancelación en progreso (`cancel-in-progress: true`). Si un desarrollador realiza múltiples *pushes* rápidos a la misma rama, GitHub cancela la ejecución anterior y prioriza la más reciente, optimizando los minutos de cómputo.

---

## 4. Gestión de Secretos y Variables de Entorno

Para que el pipeline funcione y la aplicación arranque correctamente, se requieren configuraciones externas:

### En GitHub Secrets

* `RENDER_DEPLOY_HOOK`: URL privada del servicio de **producción**. GitHub la usa para autorizar y disparar el despliegue desde `main`.
* `RENDER_DEPLOY_HOOK_STAGING`: la equivalente del servicio de **staging**, disparada desde `develop`.

### En Render (Environment Variables)

Dado que las credenciales no se exponen en el repositorio, las variables necesarias para la conexión con la API de OpenMAINT, generación de JWT y servicios de notificaciones (Nodemailer/Resend) deben inyectarse directamente en la pestaña *Environment* del panel de Render.

#### Las que cambian entre entornos

Cada servicio tiene su propia instancia de openMAINT y su propia rama de Neon, así que estas **nunca** se copian de un entorno al otro:

| Variable | Producción | Desarrollo |
| --- | --- | --- |
| `OPENMAINT_URL` | Instancia de producción | Instancia de desarrollo |
| `OPENMAINT_USERNAME` / `OPENMAINT_PASSWORD` | Credenciales de esa instancia | Las de la suya |
| `DATABASE_URL` | Rama `production`, **con** pooler | Rama `development`, **con** pooler |
| `DATABASE_URL_DIRECT` | Rama `production`, **sin** pooler | Rama `development`, **sin** pooler |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Un par propio | Otro par distinto |
| `APP_BASE_URL` | URL del frontend de producción | URL del frontend de desarrollo |
| `PASSWORD_RESET_SECRET` | Un secreto propio | Otro distinto, para que un enlace de pruebas no valga en producción |
| `ENABLE_DOCS` | `false` | `true` |
| `HOSTAWAY_USE_MOCK` | `false` | `true`, salvo que se esté probando la integración real |
| `INCIDENT_NOTIFICATION_EMAIL` | Buzón real | Buzón de pruebas |

**`PORT` no se define.** Render la inyecta y [`main.ts`](../src/main.ts) la lee con 3000 como respaldo; fijarla a mano rompe el enrutado de Render.

Antes de encender en desarrollo los schedulers que envían correo (`PAYMENTS_*`, `MEETING_REMINDER_*`, `BILLING_*`), conviene revisar qué direcciones tiene la instancia de openMAINT de desarrollo: si son copias de las reales, escribirán a personas reales.

#### Las comunes

El resto es igual en ambos servicios: `VAPID_SUBJECT`, `CALENDAR_TIMEZONE`, `MAIL_PROVIDER` y la configuración SMTP o Resend, `MAIL_THROTTLE_MS`, `HISTORIAL_EMAIL_ENABLED`, `OPENMAINT_TEMPLATE_CLASS` y las credenciales de Hostaway. Las de Contifico también, pero conviene confirmar que `CONTIFICO_BASE_URL` apunte a un entorno de pruebas en desarrollo: es facturación real.

A continuación, el detalle de cada variable:

| Variable | Descripción | Ejemplo de Valor |
| --- | --- | --- |
| `OPENMAINT_URL` | URL de la API REST de OpenMAINT en producción. | `http://187.x.x.x:8090/cmdbuild/services/rest/v3` |
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

### Base de datos y notificaciones push

Estas son **por entorno**: cada servicio apunta a su propia rama de Neon y usa su propio par VAPID. Detalle y motivos en [neon-postgres.md](neon-postgres.md).

| Variable | Descripción | Ejemplo de Valor |
| --- | --- | --- |
| `DATABASE_URL` | Cadena **con** pooler de la rama de Neon del entorno. La usa la aplicación en runtime. | `postgresql://...-pooler...neon.tech/dt4fm?sslmode=require` |
| `DATABASE_URL_DIRECT` | Cadena **sin** pooler de la misma rama. Solo para migraciones: PgBouncer rompe los *advisory locks* de DDL. | `postgresql://...neon.tech/dt4fm?sslmode=require` |
| `VAPID_PUBLIC_KEY` | Clave pública de Web Push. El frontend la pide a `GET /push/vapid-public-key`. | *(Secreto)* |
| `VAPID_PRIVATE_KEY` | Clave privada con la que se firman los envíos. **No rotar**: invalida todas las suscripciones vivas. | *(Secreto)* |
| `VAPID_SUBJECT` | Contacto que exige la especificación de Web Push. | `mailto:no-reply@dt4fm.com` |
| `PUSH_SCHEDULER_ENABLED` | Activa los avisos de preventivos por vencer y limpiezas atrasadas. | `true` |

---

