# GDGI Release Candidate 1 — Inventario de versión

**Tag:** `v0.1.0-rc1`
**Fecha de congelamiento:** 2026-08-31
**Responsable:** _(por completar)_

Registro exigido por la **Fase 0 · 5.1** del *Procedimiento de Pruebas, Validación y Paso a Producción del GDGI*. Su único objetivo es que, terminada la certificación, se pueda afirmar **exactamente qué versión fue probada**.

---

## 1. Punto fijo en el repositorio

| | |
|---|---|
| Tag | `v0.1.0-rc1` |
| Rama | `main` |
| Commit | `4f01218` — *Merge pull request #58 from Construiblec/develop* |
| Repositorio | `Construiblec/dt4fm-system` |

`main` contiene todo lo que hay en `develop`. Ambas ramas quedan alineadas en el momento del congelamiento.

---

## 2. Frontend

| | |
|---|---|
| Ubicación | `frontend/modulo-incidentes` |
| Versión de paquete | `0.0.0` |
| Framework | React `19.2` |
| Empaquetador | Vite `7.3` |
| Lenguaje | TypeScript `5.9` |
| PWA | `vite-plugin-pwa` `1.3` |
| Despliegue | Vercel |

> La versión de paquete está en `0.0.0` y nunca se ha subido. Conviene alinearla con el tag al declarar la v1.0.

---

## 3. Backend

| | |
|---|---|
| Ubicación | `backend/` |
| Versión de paquete | `0.0.1` |
| Framework | NestJS `11.0` |
| ORM | TypeORM `1.1` |
| Cliente PostgreSQL | `pg` `8.23` |
| Lenguaje | TypeScript `5.7` |
| Node en CI | `20` |
| Despliegue | Render (servicio de producción desde `main`, staging desde `develop`) |

### Módulos activos — 15

`auth` · `billing` · `buildings` · `cleaning-tasks` · `health` · `incidents` · `iot-alarms` · `maintenance-supervision` · `meeting-reminders` · `notifications` · `owners` · `password-recovery` · `payments` · `preventive-maintenance` · `push-notifications`

Suman **92 endpoints** repartidos en 17 controladores.

---

## 4. openMAINT

| | |
|---|---|
| Versión de openMAINT | `2.3` |
| Versión de CMDBuild (base) | `3.4.2-2` |
| Alojamiento | VPS Hostinger |
| API | REST v3 (`/cmdbuild/services/rest/v3`) |
| Instancia de producción | _por registrar_ |
| Instancia de desarrollo | _por registrar_ |

> openMAINT es una distribución de CMDBuild especializada en gestión de mantenimiento y activos; por eso van las dos versiones juntas — la de CMDBuild fija el motor y el modelo de procesos sobre el que corre openMAINT, y es la que determina qué endpoints de la API REST v3 existen y cómo se comportan.

> **Pendiente.** La versión no es deducible desde el repositorio. Se obtiene entrando a openMAINT como administrador, en *Información del sistema*, o consultando la versión de CMDBuild sobre la que corre. Es el único campo del 5.1 que queda sin cerrar y debe completarse antes del D3.

---

## 5. Bases de datos

El sistema usa **dos almacenes distintos**, y conviene no confundirlos al planificar respaldos:

| Almacén | Contenido | Responsable del respaldo |
|---|---|---|
| **openMAINT** (VPS) | Activos, órdenes correctivas y preventivas, tareas de limpieza, usuarios, propietarios. **Es la fuente de verdad de todo el negocio.** | Automático — `pg_dump` diario a las 3am (Guayaquil) vía cron en el VPS, 14 días de retención. Detalle y cómo restaurar en el [procedimiento de rollback, §5](procedimiento-rollback.md#5-openmaint-vps) |
| **Neon** (PostgreSQL gestionado) | Únicamente suscripciones push, historial de notificaciones e idempotencia de avisos programados. | Neon, con recuperación a un punto en el tiempo |

**Neon:** una rama por entorno — `production` para producción, `development` para staging. En local se usa el contenedor `dt4fm-pg` (`backend/docker-compose.yml`), PostgreSQL `17.4-alpine`.

### Esquema — 2 migraciones

| Migración | Crea |
|---|---|
| `1787588739437-CreatePushNotificationTables` | `notification_dispatch_log`, `notifications`, `push_subscriptions` |
| `1787600000000-PushSubscriptionMultipleRoles` | Migra `role` (texto) a `roles` (array) con índice GIN |

Verificado que el esquema se levanta desde cero sobre una base vacía con `npm run migration:run`.

---

## 6. Contenedores

| | |
|---|---|
| Docker | `29.6.1` |
| Docker Compose | `v5.3.0` |
| Contenedor local | `dt4fm-pg` — `postgres:17.4-alpine`, puerto `5555` |

Solo se usa Docker en desarrollo local y en el CI. Ni el backend ni el frontend se despliegan en contenedor: Render y Vercel construyen desde el repositorio.

---

## 7. Integraciones — 3

| Integración | Uso | Corte en pruebas |
|---|---|---|
| **openMAINT** | Núcleo de gestión; siete servicios distintos del backend hablan con él | Mockeado en las suites automatizadas |
| **Hostaway** | Checkouts que generan tareas de limpieza | `HOSTAWAY_USE_MOCK` |
| **Contifico** | Facturación de reservas | Mockeado; **es facturación real**, revisar el entorno antes de activarlo |

Correo saliente vía SMTP o Resend, según `MAIL_PROVIDER`. En Render debe ser Resend: la plataforma bloquea las conexiones SMTP salientes.

---

## 8. IoT

| | |
|---|---|
| Emisor | Servidor Raspberry Pi con motor de reglas propio |
| Contrato | `POST /iot/alarms`, autenticado con la cabecera `X-IoT-Secret` |
| Enlace con openMAINT | El campo `assetCode` — es lo único que ata la alarma a un activo |

**Comportamiento a tener presente en las pruebas:** la Raspberry emite cada alarma **una sola vez y no reintenta**. El backend reintenta por ella (`IOT_CREATE_MAX_ATTEMPTS`, 3 por defecto); agotados los intentos, el payload íntegro queda en el registro de error como única copia.

### Dispositivos activos en el piloto

| Dispositivo | Sensor de presión (genérico, sin marca) |
|---|---|
| Rango | 0 a 1.2 MPa (0 a 12 bar) |
| Medio | Agua, aceite o aire |
| Salida | Analógica, 0 a 5 V |
| Alimentación | 5 V |
| Conexión mecánica | Rosca 1/4" |
| `assetCode` en openMAINT | **_por registrar_** |
| Activo asociado | **_por registrar_** |

La conversión de la señal analógica al valor que viaja en el payload (`psi` en el contrato documentado en [`openmaint-iot-alarms.md`](../integrations/openmaint-iot-alarms.md)) la hace el motor de reglas de la Raspberry antes de emitir la alarma; el backend solo recibe el número ya convertido.

> **Pendiente.** Falta grabar el `assetCode` en el dispositivo y confirmar a qué activo de openMAINT corresponde — es lo único que falta para que TI-002 y TI-003 puedan ejecutarse contra hardware real en vez de una petición simulada al webhook.

---

## 9. Cobertura de pruebas en el momento del congelamiento

| | |
|---|---|
| Pruebas unitarias | 178, en 10 archivos |
| Pruebas E2E | 139, una suite por módulo |
| Tiempo de ejecución | ~10 s las E2E, ~7 s las unitarias |
| Ejecución | Automática en cada envío a `main` y `develop`, y en cada pull request |

El despliegue en Render está bloqueado detrás de estas pruebas: el job `deploy` no arranca si el job `test` falla.

---

## 10. Configuración utilizada

Las variables van en el panel de Render y no en el repositorio. El detalle completo, con qué cambia entre entornos y qué es común, está en [`backend/docs/backend-ci-cd.md`](../../backend/docs/backend-ci-cd.md) y [`backend/docs/neon-postgres.md`](../../backend/docs/neon-postgres.md).

Para el congelamiento importa dejar constancia de estos ajustes:

| Variable | Producción | Staging |
|---|---|---|
| `ENABLE_DOCS` | `false` | `true` |
| `HOSTAWAY_USE_MOCK` | `false` | `true` |
| `HOSTAWAY_SCHEDULER_ENABLED` | _por registrar_ | `false` |
| `BILLING_SCHEDULER_ENABLED` | _por registrar_ | `false` |
| `PAYMENTS_SCHEDULER_ENABLED` | _por registrar_ | `false` — **apagado el 2026-09-04** |
| `MEETING_REMINDER_SCHEDULER_ENABLED` | _por registrar_ | `false` — **apagado el 2026-09-04** |

> **Ojo con los dos últimos.** Estaban **activos** en staging hasta el 2026-09-04, programados a las 03:00. Ambos **envían correo a los residentes**, y el backend de staging apunta a la instancia de openMAINT de desarrollo, que es el clon refrescado con datos de producción — es decir, con direcciones reales. Se apagaron al detectarlo durante el ensayo de rollback. Antes de volver a encenderlos en staging, confirmar que `MAIL_PROVIDER` apunta a un buzón de captura (Mailtrap sandbox) y no a un proveedor que entregue de verdad.

---

## 11. Estado conocido al congelar

Se congela con estos defectos abiertos, todos registrados en el [Backlog Post-Piloto](backlog-post-piloto.md):

| Severidad | Asunto |
|---|---|
| **P1** | Los endpoints de propietarios no exigen sesión: la identidad sale de un número en la URL |
| **P1** | CORS refleja cualquier origen y permite credenciales |
| **P2** | El rol de usuario se valida contra la cabecera `x-role`, que controla el cliente |
| **P2** | No existe procedimiento de rollback escrito, en particular para revertir una versión que ya aplicó una migración |

Los cuatro son la **puerta de entrada del D3**: la certificación no empieza a medir hasta que estén cerrados.
