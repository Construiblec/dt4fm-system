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

### Jobs: `test` y `deploy`

El pipeline tiene dos trabajos secuenciales; `deploy` no arranca si `test` falla.

**`test`** — corre en todo push y PR a `main`/`develop`, incluidas las pull requests (que antes solo compilaban):

1. **Checkout** y **Setup Node.js** (Node 20, caché de NPM).
2. **`services: postgres`**: un contenedor `postgres:17.4-alpine` efímero, vive solo durante el job. No es infraestructura que operar — nada que ver con Neon — y solo lo necesita el módulo de push-notifications, la única persistencia propia del backend; el resto de las suites van con openMAINT, correo, Contifico y Hostaway mockeados (`backend/test/helpers/test-app.ts`).
3. **`npm ci`**.
4. **`npm run migration:run`**: aplica el esquema sobre el Postgres del job (no toca Neon).
5. **`npm test`**: los ~178 tests unitarios.
6. **`npm run test:e2e`**: las 15 suites E2E, una por módulo.
7. **`npm run build`**: valida la compilación de TypeScript.

**`deploy`** — `needs: test`; solo en *push* directo a `main` o `develop` (nunca en PR):

1. **Deploy Hook:** dispara el webhook de Render del entorno que corresponde a la rama.
2. **Smoke test:** el webhook responde de inmediato pero el despliegue es asíncrono, así que un `curl` justo después podría ver la versión *anterior* y dar un falso verde. Este paso sondea `GET /health` cada 10 s (hasta 5 min) esperando que el campo `commit` — que Render rellena solo vía `RENDER_GIT_COMMIT` — coincida con el SHA que se acaba de desplegar. Necesita el secret `RENDER_SERVICE_URL[_STAGING]` (ver abajo); sin él se omite con un aviso, porque el despliegue ya se disparó igual — es una verificación adicional, no la señal de que el deploy ocurrió.

### Control de Concurrencia

El pipeline incluye una regla de cancelación en progreso (`cancel-in-progress: true`). Si un desarrollador realiza múltiples *pushes* rápidos a la misma rama, GitHub cancela la ejecución anterior y prioriza la más reciente, optimizando los minutos de cómputo.

---

## 4. Gestión de Secretos y Variables de Entorno

Para que el pipeline funcione y la aplicación arranque correctamente, se requieren configuraciones externas:

### En GitHub Secrets

* `RENDER_DEPLOY_HOOK`: URL privada del servicio de **producción**. GitHub la usa para autorizar y disparar el despliegue desde `main`.
* `RENDER_DEPLOY_HOOK_STAGING`: la equivalente del servicio de **staging**, disparada desde `develop`.
* `RENDER_SERVICE_URL` / `RENDER_SERVICE_URL_STAGING` *(opcionales)*: URL pública de cada servicio (p. ej. `https://dt4fm-backend.onrender.com`), sin barra final. Habilitan el smoke test post-despliegue; sin ellas el paso se omite con un aviso y el resto del pipeline sigue igual.

### En Render (Environment Variables)

Dado que las credenciales no se exponen en el repositorio, las variables necesarias para la conexión con la API de OpenMAINT, generación de JWT y servicios de notificaciones (Nodemailer/Resend) deben inyectarse directamente en la pestaña *Environment* del panel de Render.

#### Las que cambian entre entornos

Cada servicio tiene su propia instancia de openMAINT y su propia rama de Neon, así que estas **nunca** se copian de un entorno al otro:

| Variable | Producción | Desarrollo |
| --- | --- | --- |
| `OPENMAINT_URL` | Instancia de producción | Instancia de desarrollo |
| `OPENMAINT_USERNAME` / `OPENMAINT_PASSWORD` | Credenciales de esa instancia | Las de la suya |
| `OPENMAINT_CLEANING_TEAM_ID` | `_id` del equipo «Auxiliar operativo» en esa instancia | El de la suya (staging: `2397132`). Sin ella, el coordinador ve a todos los empleados (internos y externos), y la API de limpiezas responde 503 al asignar un operario y al listarlos: es obligatoria para planificar por la API |
| `DATABASE_URL` | Rama `production`, **con** pooler | Rama `development`, **con** pooler |
| `DATABASE_URL_DIRECT` | Rama `production`, **sin** pooler | Rama `development`, **sin** pooler |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Un par propio | Otro par distinto |
| `APP_BASE_URL` | URL del frontend de producción | URL del frontend de desarrollo |
| `PASSWORD_RESET_SECRET` | Un secreto propio | Otro distinto, para que un enlace de pruebas no valga en producción |
| `INTEGRATIONS_READ_API_KEYS` / `INTEGRATIONS_WRITE_API_KEYS` | Claves propias, y distintas entre las dos listas | Otras distintas |
| `HOSTAWAY_SCHEDULER_ENABLED` | `true`, si la sincronización automática se usa en este openMAINT | `true` solo si su openMAINT es propio. Un único entorno encendido por cada openMAINT: dos sobre el mismo duplican limpiezas. Apagada en desarrollo y en local si lo comparten con otro entorno que la tenga encendida |
| `ENABLE_DOCS` | `false` | `true` |
| `CONTIFICO_USE_MOCK` | `false` | `true`, y sin `CONTIFICO_API_KEY` ni `CONTIFICO_POS_TOKEN`: cada documento que Contifico acepta es una factura real |
| `MAIL_REDIRECT_TO` | Vacía | Buzón de pruebas: todo correo sale hacia él, con el destinatario original en el asunto |
| `HOSTAWAY_USE_MOCK` | `false` | `false` también: la sincronización de tareas de limpieza necesita las reservas reales. La entrega del enlace del huésped por Hostaway está limitada a la reserva de prueba ([guest-stay.service.ts](../src/modules/access-control/guest-stay.service.ts)), un filtro temporal del piloto |
| `INCIDENT_NOTIFICATION_EMAIL` | Buzón institucional | Buzón de pruebas |
| `OPENMAINT_MAINTENANCE_TEAM_IDS` | Ids de los equipos de mantenimiento de producción | Ids de los equipos de mantenimiento de staging |
| `CORS_ALLOWED_ORIGINS` | Solo el dominio de Vercel de producción | El de staging (+ `localhost:5173` para desarrollar contra el backend remoto) |

**`PORT` no se define.** Render la inyecta y [`main.ts`](../src/main.ts) la lee con 3000 como respaldo; fijarla a mano rompe el enrutado de Render.

La instancia de openMAINT de desarrollo guarda direcciones que pueden ser copias de las reales. Por eso, en desarrollo, los schedulers que envían correo (`PAYMENTS_*`, `MEETING_REMINDER_*`) quedan apagados, y solo se encienden para probarlos con `MAIL_REDIRECT_TO` definida. El de facturación (`BILLING_*`), solo con `CONTIFICO_USE_MOCK=true`.

#### Las comunes

El resto es igual en ambos servicios: `VAPID_SUBJECT`, `CALENDAR_TIMEZONE`, `MAIL_PROVIDER` y la configuración SMTP o Resend, `MAIL_THROTTLE_MS`, `HISTORIAL_EMAIL_ENABLED`, `OPENMAINT_TEMPLATE_CLASS` y las credenciales de Hostaway. Las de Contifico solo existen en producción.

`LOG_LEVEL=log` y `LOG_FORMAT` vacía en los dos. Con `log` sale una línea por petición, con su `rid`, y los eventos de negocio. Para depurar, `LOG_LEVEL=debug` añade cada llamada a openMAINT y a Contifico. Cambiarla en Render redespliega, así que hay que devolverla a `log` al terminar. Cómo leer los logs y buscar una petición por su `rid`: [logging.md](logging.md).

A continuación, el detalle de cada variable:

| Variable | Descripción | Ejemplo de Valor |
| --- | --- | --- |
| `OPENMAINT_URL` | URL de la API REST de OpenMAINT en producción. | `http://187.x.x.x:8090/cmdbuild/services/rest/v3` |
| `OPENMAINT_USERNAME` | Usuario administrador para autenticación con OpenMAINT. | `admin` |
| `OPENMAINT_PASSWORD` | Contraseña del usuario de OpenMAINT. | *(Secreto)* |
| `HOSTAWAY_CLIENT_ID` | Client ID para la autenticación OAuth 2.0 con Hostaway. | `149703` |
| `HOSTAWAY_CLIENT_SECRET`| Client Secret para Hostaway. | *(Secreto)* |
| `HOSTAWAY_USE_MOCK` | Desactiva/Activa el uso de datos mock en lugar de la API. | `false` (en producción) |
| `HOSTAWAY_SCHEDULER_ENABLED`| Habilita la sincronización automática de limpiezas con Hostaway: barrido cada 15 minutos y señal del webhook de reservas. Crea, actualiza y cancela limpiezas ([detalle](limpieza%20modulo/hostaway-checkouts.md)). Solo un entorno por cada openMAINT, y nunca con `HOSTAWAY_USE_MOCK=true`. Apagada, tampoco atiende el webhook. | `true` |
| `HOSTAWAY_SYNC_DAYS` | Días que abarca la sincronización, contando hoy en hora de Guayaquil (1–14). Vacía o fuera de rango vale `2`: hoy y mañana. | `2` |
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
| `INTEGRATIONS_READ_API_KEYS` | Claves de lectura de la API de integraciones ([limpiezas](integraciones/api-limpiezas.md) y mantenimiento): `nombre:clave` separado por comas, cada clave de 32 caracteres o más, sin comas ni coma final. El cliente envía solo la clave. Se genera con el comando de la cabecera de `.env.example`. Para rotar, añadir otra entrada con el mismo nombre (comparten cupo), cambiar el cliente y quitar la vieja. Una entrada inválida anula toda la lista. Si ninguna de las dos listas tiene claves válidas, la API responde 503. | *(Secreto)* |
| `INTEGRATIONS_WRITE_API_KEYS` | Claves con permiso de escritura en la misma API, con el mismo formato; también leen. Sin valor, con una entrada inválida o con una clave repetida en `INTEGRATIONS_READ_API_KEYS`, la escritura responde 503 y las claves de lectura siguen funcionando. Una clave de lectura en una ruta de escritura recibe 403. | *(Secreto)* |
| `OPENMAINT_MAINTENANCE_TEAM_IDS` | Ids de los equipos (`Team`) de mantenimiento, separados por coma: sus empleados son los técnicos de `GET /integrations/v1/technicians`. Vacía o inválida, esa ruta responde 503. Cambian entre instancias. | `<id Team>,<id Team>` |
| `OPENMAINT_CM_BACK_TO_ASSIGNMENT_ACTION_ID` | Id (entero) de la acción «Volver a asignación» de CM03. Opcional: vacía o inválida, la API de integraciones responde 409 al reprogramar o cancelar un correctivo ya asignado; cambiar de técnico funciona sin ella. Se llena cuando la acción exista en OpenMAINT. | *(Opcional)* `<id de la acción>` |
| `CORS_ALLOWED_ORIGINS` | Orígenes con permiso de llamar a la API desde el navegador, separados por coma. Vacío usa los tres del piloto por defecto ([`cors.config.ts`](../src/config/cors.config.ts)). | `https://dt4fm-system-f7cc.vercel.app` |

**Renombrado de las claves de la API.** `CLEANINGS_API_KEYS` y `CLEANINGS_WRITE_API_KEYS` pasan a `INTEGRATIONS_READ_API_KEYS` e `INTEGRATIONS_WRITE_API_KEYS`. El código sigue leyendo las viejas como respaldo y, si las usa (o están las dos), deja en el log al arrancar, una vez por proceso, `CLEANINGS_API_KEYS está obsoleta: renombrar a INTEGRATIONS_READ_API_KEYS`. Con las dos, gana la nueva. Orden de despliegue en cada entorno:

1. Desplegar el código con el respaldo.
2. Crear las variables nuevas en Render, en staging y en producción, con los mismos valores.
3. Comprobar en el log que el aviso ya no sale tras el redespliegue.
4. Quitar las viejas.

**Contraseña de servicio rechazada.** Si openMAINT responde 401 o 403 al iniciar la sesión de servicio de limpiezas, el backend no lo vuelve a intentar durante 5 minutos, para no bloquear la cuenta; mientras tanto la API de limpiezas responde 503. Tras corregir la contraseña en openMAINT hay que esperar hasta 5 minutos o reiniciar el servicio; si se corrige en Render, el redespliegue ya lo reinicia. Los demás módulos que usan la misma cuenta no tienen esta espera y siguen intentándolo.

### Puesta en marcha de la sincronización y de la escritura de limpiezas

En este orden y en cada entorno:

1. **Migraciones `1790000000000-CreateCleaningSyncCancellation` y `1790100000000-CreateCleaningSyncBaseline`, antes que el código nuevo.** Crean `cleaning_sync_cancellation`, donde la sincronización marca lo que cancela, y `cleaning_sync_baseline`, con lo último que dijo Hostaway de cada reserva. En producción la aplica el *Pre-Deploy Command* y en desarrollo el *Start Command* ([sección 2](#2-configuración-de-los-servicios-en-render)); en local, `npm run migration:run`. Sin la tabla, la sincronización no cancela ni recrea: esas reservas cuentan como fallidas en cada pasada.
2. **Desplegar con `HOSTAWAY_SCHEDULER_ENABLED=false`** y comprobar que la versión nueva responde (`GET /health`).
3. **Definir** `OPENMAINT_CLEANING_TEAM_ID` y, si un cliente va a planificar, `INTEGRATIONS_WRITE_API_KEYS`.
4. **Decidir qué entorno sincroniza cada openMAINT** y encender `HOSTAWAY_SCHEDULER_ENABLED=true` solo en ese, con `HOSTAWAY_USE_MOCK=false`. Si cambia de entorno, apagarla en el anterior antes de encenderla en el nuevo.
5. **Comprobar** `GET /integrations/v1/cleaning-sync` con una clave de lectura: `enabled: true` y, pasados 15 minutos, `lastSuccessAt` con valor. Sus datos viven en memoria y se vacían al reiniciar.
6. **Retirar** `HOSTAWAY_SCHEDULER_HOUR` y `HOSTAWAY_SCHEDULER_MINUTE` del panel: el código ya no las lee.

El servicio cierra con `SIGTERM`: en un despliegue se envían los avisos agrupados pendientes (hasta 10 s). Una caída brusca puede perderlos; los cambios ya están guardados.

### Base de datos y notificaciones push

Estas son **por entorno**: cada servicio apunta a su propia rama de Neon y usa su propio par VAPID. Detalle y motivos en [neon-postgres.md](neon-postgres.md).

| Variable | Descripción | Ejemplo de Valor |
| --- | --- | --- |
| `DATABASE_URL` | Cadena **con** pooler de la rama de Neon del entorno. La usa la aplicación en runtime. | `postgresql://...-pooler...neon.tech/dt4fm?sslmode=verify-full` |
| `DATABASE_URL_DIRECT` | Cadena **sin** pooler de la misma rama. Solo para migraciones: PgBouncer rompe los *advisory locks* de DDL. | `postgresql://...neon.tech/dt4fm?sslmode=verify-full` |
| `VAPID_PUBLIC_KEY` | Clave pública de Web Push. El frontend la pide a `GET /push/vapid-public-key`. | *(Secreto)* |
| `VAPID_PRIVATE_KEY` | Clave privada con la que se firman los envíos. **No rotar**: invalida todas las suscripciones vivas. | *(Secreto)* |
| `VAPID_SUBJECT` | Contacto que exige la especificación de Web Push. | `mailto:no-reply@dt4fm.com` |
| `PUSH_SCHEDULER_ENABLED` | Activa los avisos de preventivos por vencer y limpiezas atrasadas. | `true` |

---

