# Módulo de Notificaciones Push – Backend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Este documento describe el módulo de **notificaciones push web** del backend DT4FM.

El módulo envía avisos al celular de empleados, proveedores y supervisores cuando cambian de estado las tareas de **mantenimiento correctivo**, **mantenimiento preventivo** y **limpieza**, sin que tengan que abrir la aplicación a revisar.

Es un módulo **distinto** del de [notificaciones por correo](../notifications%20module/notifications-module.md), que sigue existiendo sin cambios. Ambos pueden convivir sobre el mismo evento.

Toda notificación enviada se persiste, aunque la pestaña de historial que la consumirá se implemente más adelante.

---

## 2. Objetivos de diseño

* **La entrega no se da por garantizada.** Web Push no asegura entrega ni tiempo, así que el historial persistido es la única traza real de lo que se avisó.
* **Ningún fallo de notificación tumba la operación que lo originó.** Todos los disparadores son *fire-and-forget* con captura de errores.
* **La identidad se resuelve en el servidor.** El cliente no decide a quién ni como quién se notifica.
* **El almacén es sustituible.** El acceso a datos vive tras un repositorio, siguiendo el patrón de `MailProvider`.

---

## 3. Alcance implementado

Diez notificaciones. La columna *Punto de disparo* indica dónde se ejecuta el código que las lanza.

### 3.1. Correctivos

| Evento | Destinatario | Punto de disparo |
|---|---|---|
| Apertura | Supervisores de mantenimiento | `incidents.service.ts` → `sendIncidentNotificationInBackground` |
| Asignación | Empleado o proveedor asignado | `maintenance-supervision.service.ts` → `assignCorrective` |
| Paso a Contabilidad (completado) | Supervisores de mantenimiento | `incidents.service.ts` → `sendIncidentFinishedNotificationInBackground` |

### 3.2. Preventivos

| Evento | Destinatario | Punto de disparo |
|---|---|---|
| Planificación, un mes antes | Supervisores de mantenimiento | `PreventivePlanningSchedulerService` |
| Planificación, dos días antes | Supervisores de mantenimiento | `PreventivePlanningSchedulerService` |
| Asignación | Empleado o proveedor asignado | `maintenance-supervision.service.ts` → `assignPreventive` |
| Suspensión | Supervisores de mantenimiento | `preventive-maintenance.service.ts` → `suspendPreventiveMaintenance` |

### 3.3. Limpieza

| Evento | Destinatario | Punto de disparo |
|---|---|---|
| Asignación | Empleado de limpieza | `cleaning-tasks.service.ts` → `updateCleaningTask` |
| Retraso sobre la hora prevista | Empleado de limpieza | `CleaningDelaySchedulerService` |
| Completada | Supervisores de limpieza | `cleaning-tasks.service.ts` → `completeTask` |

### 3.4. Fuera de alcance y por qué

* **Correctivo → Ejecución.** No existe el momento «el técnico arranca»: la acción `CM02-Advance` lleva la instancia de Asignación directamente a Ejecución en el mismo instante en que el supervisor asigna, y openMAINT rellena `ExecStartDate` con la fecha *prevista*. Por eso existe el estado derivado `Assigned`. Habilitarlo exige implementar antes el `POST /incidents/:id/start` que la documentación de [supervisión de mantenimiento](../maintenance-supervision/maintenance-supervision.md) ya marca como pendiente.
* **Preventivo → Des-suspensión.** La acción `PM_ACTIONS.RESUME` está declarada pero no se usa: esa transición hoy se hace dentro de openMAINT, fuera de la aplicación.
* **Notificaciones a residentes.** Previstas para una fase posterior.

---

## 4. Limitación estructural: el disparador vive en la aplicación

Los siete disparadores inmediatos se ejecutan cuando la acción pasa por los endpoints de este backend. **Un cambio de estado hecho directamente en la interfaz web de openMAINT no genera ninguna notificación.**

El backend es un cliente REST de openMAINT: le hace peticiones, pero no escucha nada. No hay ningún código propio ejecutándose cuando alguien avanza un flujo desde la consola de openMAINT.

Mientras las asignaciones, ejecuciones y cierres se hagan desde la aplicación, el diseño actual es suficiente. Si en el futuro se necesitara notificar cambios originados dentro de openMAINT, harían falta dos caminos posibles, ninguno implementado:

* **Sondeo periódico** que detecte cambios comparando contra el último estado visto. El atributo `_beginDate` de la tarjeta sirve como marca de versión: openMAINT lo actualiza en cada modificación.
* **Un job del lado de CMDBuild** que invoque un webhook del backend al avanzar el flujo.

---

## 5. Arquitectura

```text
Módulos de dominio                    Schedulers
(incidents, cleaning-tasks,        (preventivos por vencer,
 maintenance-supervision,           limpiezas atrasadas)
 preventive-maintenance)                    │
        │                                   │
        │  llamada directa                  │  claimDispatch() → idempotencia
        │  fire-and-forget                  │
        ▼                                   ▼
              PushDispatchService
                      │
        ├─ resuelve destinatarios (por rol o por empleado)
        ├─ arma título, cuerpo y deep link  (notification-catalog.ts)
        ├─ persiste en `notifications`      (historial)
        │
        ▼
              PushSenderService
                      │
                      ▼
        Push service del navegador (FCM / Mozilla / Apple)
                      │
                      ▼
              Service worker del dispositivo
```

Se descartó un bus de eventos: son siete puntos de llamada, no hay riesgo de dependencia circular (el módulo de push depende de `OpenmaintModule` y TypeORM, nunca de los módulos que lo consumen) y las llamadas directas son la convención ya establecida por `incidents.service.ts`.

---

## 6. Capas del módulo

### 6.1. Catálogo de mensajes

`notification-catalog.ts` — Concentra **todo el texto** de las notificaciones, los tipos estables que se persisten y los deep links. Es el único archivo que hay que tocar para cambiar lo que dice un aviso.

Incluye `joinLocation`, que une los segmentos de ubicación disponibles descartando los vacíos.

### 6.2. Despacho

`push-dispatch.service.ts` — `PushDispatchService`. Un método por tipo de notificación. Resuelve destinatarios, persiste el historial y delega el envío. **Ningún método propaga errores**: se invocan con `void` desde los módulos de dominio.

Aquí vive también la regla de ubicación del correctivo abierto: si no hay unidad inmobiliaria se muestra la planta.

### 6.3. Envío

`push-sender.service.ts` — `PushSenderService`. Cifra y entrega con la librería `web-push` en lotes de 10 envíos simultáneos.

Ante un **404 o 410** del push service borra la suscripción: el navegador ya la descartó y, si no se elimina, la tabla acumula registros muertos y cada envío gasta peticiones contra ellos. Cualquier otro error incrementa `failure_count`.

### 6.4. Alta y baja

`push-subscription.service.ts` — Registra y da de baja dispositivos. Resuelve la identidad contra openMAINT (ver sección 8).

`push-notifications.controller.ts` — Endpoints HTTP.

### 6.5. Persistencia

`push-subscription.repository.ts` — Único punto de acceso a las tres tablas. Los servicios no usan repositorios de TypeORM directamente.

### 6.6. Procesos programados

`scheduler/push-scheduler.gateway.ts` — Consultas propias de los barridos, con sesión de servicio cacheada y **paginación**. Vive aquí y no en los gateways de dominio para que el módulo de push no dependa de los módulos que lo consumen.

`scheduler/preventive-planning.scheduler.service.ts` y `scheduler/cleaning-delay.scheduler.service.ts` — Los dos barridos.

`scheduler/scheduler.constants.ts` — Zona horaria del negocio y cálculo de días en calendario local.

---

## 7. Modelo de datos

### `push_subscriptions`

Una fila por **dispositivo**.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | `gen_random_uuid()`, nativo desde PG 13 (no requiere `uuid-ossp`) |
| `user_id` | text | userId de openMAINT |
| `username` | text | |
| `roles` | text[] | **Todos** los roles del usuario. Índice GIN |
| `employee_id` | integer | Employee vía `LoginUser`: direcciona correctivos y preventivos |
| `cleaning_employee_id` | integer | Employee vía `PortalUsername`: direcciona limpieza |
| `endpoint` | text | **UNIQUE**. Identidad natural de la suscripción |
| `p256dh`, `auth` | text | Claves de cifrado del cliente |
| `user_agent` | text | Diagnóstico |
| `created_at`, `last_seen_at` | timestamptz | |
| `failure_count` | integer | |

### `notifications`

Historial. Una fila **por destinatario**: un usuario con tres dispositivos recibe tres push pero genera una sola entrada.

`id`, `user_id`, `type`, `title`, `body`, `deep_link`, `entity_kind`, `entity_id`, `created_at`, `read_at`.

### `notification_dispatch_log`

Idempotencia de los barridos. Clave primaria sobre `event_key` (por ejemplo `preventive:1234:planning-30d`). Se inserta con `ON CONFLICT DO NOTHING` y solo se envía si la inserción prosperó, de modo que un reinicio a mitad de barrido no reenvía lo ya enviado.

### 7.1. Dos identificadores de empleado, no uno

`employee_id` y `cleaning_employee_id` son columnas **distintas** a propósito. El login resuelve dos identificadores contra la misma clase `Employee` de openMAINT pero por vías diferentes: `LoginUser` para uno y `PortalUsername` para el otro. Los módulos los usan de forma cruzada — limpieza valida contra `cleaningEmployeeId`, mantenimiento contra `employeeId` — así que colapsarlos rompería el direccionamiento.

Si un usuario no tiene ficha de `Employee` asociada, ambos quedan nulos y **solo recibirá notificaciones dirigidas a su rol**, nunca las de tareas asignadas. El servicio deja una advertencia en el log al detectarlo, porque el síntoma no tiene ninguna otra pista.

### 7.2. Roles múltiples

`roles` es un array y no un texto porque un usuario puede pertenecer a varios grupos de openMAINT (supervisor de limpieza y de mantenimiento a la vez) e ir alternando de rol dentro de la aplicación. **Mientras tenga sesión debe recibir los avisos de todos sus roles**, con independencia del dashboard que esté mirando.

El fan-out usa solapamiento de arrays (`roles && :roles`), apoyado en el índice GIN. Los roles salen de `availableRoles` de la sesión de openMAINT, así que en cuanto se configure multigrupo empezará a funcionar sin cambios de código.

---

## 8. Resolución de identidad y seguridad

El header `x-role` sale de `localStorage` y es manipulable desde el cliente, como ya advierte `supervision-roles.constants.ts`. **No interviene en el alta de suscripciones.**

Al registrarse, el backend llama a `GET /sessions/current` de openMAINT con el sessionId recibido. Ese recurso cumple dos funciones a la vez:

1. **Valida la sesión** — un 400/401/403 corta el alta.
2. **Devuelve la identidad y los roles reales** — `userId`, `username`, `role` y `availableRoles`.

Se eligió `/sessions/current` y no `GET /users/{id}` porque este último es un **recurso administrativo**: funcionaba con la cuenta `admin` pero fallaba para cualquier usuario normal. Además `/sessions/current` ata la identidad a la sesión, así que nadie puede suscribirse en nombre de otro.

Los errores se distinguen: solo un fallo de autenticación produce un 401. Cualquier otra avería de openMAINT se reporta como 502 con su mensaje real, para que el usuario no vea «vuelve a iniciar sesión» ante un problema que iniciar sesión no arregla.

### 8.1. Dispositivos compartidos

`endpoint` pertenece al navegador, no a la persona. En un turno con celulares o tabletas compartidas, si un empleado cierra sesión y entra otro en el mismo dispositivo, el endpoint es el mismo.

Por eso el alta es un **upsert sobre `endpoint`** que reasigna el usuario en lugar de insertar una fila nueva, y el cierre de sesión **da de baja de verdad** la suscripción. Sin ambas cosas, el usuario entrante recibiría las notificaciones del saliente.

### 8.2. Contenido visible en la pantalla de bloqueo

El payload viaja cifrado y el push service no puede leerlo, pero el texto se muestra sin desbloquear el teléfono. Los mensajes incluyen nombre de unidad inmobiliaria y de empleado: conviene tenerlo presente al redactar textos nuevos en `notification-catalog.ts`.

---

## 9. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/push/vapid-public-key` | Clave pública con la que el navegador se suscribe |
| `POST` | `/push/subscribe` | Alta del dispositivo. 204 sin cuerpo |
| `DELETE` | `/push/subscribe` | Baja del dispositivo. Se llama al cerrar sesión |

Cabecera de sesión: `authorization` o `x-session-token` — se aceptan ambas porque los módulos del frontend usan nombres distintos.

El alta **no recibe `userId` ni rol**: se derivan de la sesión.

---

## 10. Procesos programados

Usan `@nestjs/schedule` con `@Cron` en lugar del patrón de `setTimeout` en memoria de los schedulers antiguos, que se pierden en cada reinicio y se duplicarían con más de una instancia.

| Barrido | Frecuencia | Notas |
|---|---|---|
| Preventivos por vencer | Diario a las 08:00 | Ventanas de 25–30 días y de 0–2 días |
| Limpiezas atrasadas | Cada 15 min, de 06:00 a 20:00 | Restringido a horario laboral |

Ambos en la zona horaria del negocio (`CALENDAR_TIMEZONE`, por defecto `America/Guayaquil`).

**Las ventanas son rangos y no valores exactos** para sobrevivir a un día sin ejecutar — un despliegue justo a la hora del cron. Que solo se avise una vez lo garantiza `notification_dispatch_log`.

El barrido de limpieza consulta **openMAINT primero** y solo toca PostgreSQL cuando encuentra una tarea atrasada. Es deliberado: cada consulta a la base despierta el compute de Neon, y un cron cada 15 minutos que la tocara siempre agotaría la cuota de CU-horas sin tráfico real.

El gateway **pagina** todas las consultas. Con 354 preventivos en planificación, un `limit` fijo de 200 truncaba en silencio y se saltaba el 43% de los candidatos.

---

## 11. Variables de entorno

```bash
# Par VAPID. Generar UNA sola vez con: npx web-push generate-vapid-keys
# NO ROTAR: las suscripciones quedan atadas a la clave pública con la que se
# crearon; cambiarlas invalida todas y obliga a reactivar en cada dispositivo.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:no-reply@tu-dominio.com

# Barridos programados. Solo "true" los activa.
PUSH_SCHEDULER_ENABLED=false
```

La clave pública también se expone al frontend por `GET /push/vapid-public-key`, que es la fuente de verdad: el servidor es quien firma los envíos.

Requiere además `DATABASE_URL` y `DATABASE_URL_DIRECT` (ver [ADR-004](../../../docs/architecture/ADR-004-alojamiento-base-datos-propia.md)) y las credenciales de openMAINT ya existentes, que los barridos usan para su sesión de servicio.

---

## 12. Limitaciones conocidas

* **Los preventivos no tienen unidad inmobiliaria.** `PreventiveMaintCard` no declara `Unit` en openMAINT. Los mensajes de asignación y suspensión muestran `[Activo] - [Edificio]` en lugar de los tres segmentos. Ampliarlo exige tocar el modelo de openMAINT, no el código.
* **El aviso de retraso de limpieza requiere `PlannedStartTime`.** `syncFromHostaway` no envía ese atributo, así que las tareas generadas automáticamente nacen sin hora prevista y quedan fuera del barrido hasta que alguien se la asigne.
* **El historial solo existe para usuarios suscritos.** El fan-out por rol se resuelve sobre la tabla de suscripciones, de modo que quien nunca activó las notificaciones tampoco genera entradas de historial.
* **No hay preferencias por tipo de evento.** Todos los destinatarios de un rol reciben todos los avisos de ese rol.

---

## 13. Diagnóstico

El alta deja constancia de lo que guardó:

```text
LOG  [PushSubscriptionService] Suscripción push registrada: usuario.prueba
     roles=[MaintOffice] employeeId=1456396 cleaningEmployeeId=1456396

WARN [PushSubscriptionService] El usuario admin (id 189802) no tiene Employee
     asociado: no recibirá avisos de tareas asignadas, solo los de su rol.
```

Comprobaciones útiles cuando «no llega ninguna notificación»:

```sql
-- ¿Se registró el dispositivo, y con qué roles e identificadores?
SELECT username, roles, employee_id, cleaning_employee_id, failure_count
FROM push_subscriptions;

-- ¿Se llegó a generar la notificación?
SELECT user_id, type, title, created_at
FROM notifications ORDER BY created_at DESC LIMIT 10;
```

Orden habitual de las causas:

1. La acción se hizo **dentro de openMAINT** y no desde la aplicación (sección 4).
2. No hay ninguna suscripción registrada: el alta falló en el frontend.
3. La suscripción existe pero `employee_id` es nulo y el aviso era de tarea asignada (sección 7.1).
4. El evento ocurrió **antes** de suscribirse: el push se envía en el instante del evento, no se acumula.