# Integración con Hostaway: checkouts y sincronización

Cómo el backend trae los checkouts de Hostaway y genera las tareas de limpieza en openMAINT, y cómo se dispara ese proceso hoy.

Reemplaza al documento antiguo en `docs/integrations/Integracion Hostaway/`, que describía una arquitectura distinta (páginas ExtJS con acceso directo a la API de openMAINT) de cuando el backend NestJS todavía no existía. Esa carpeta queda obsoleta — ver la nota al final.

---

## 1. Arquitectura actual

```
Hostaway API  →  HostawayService (backend)  →  CleaningTasksService  →  openMAINT (clase CleaningTask)
                                                        ↑
                        ┌───────────────────────────────┼───────────────────────────────┐
                        │                                │                               │
              Página personalizada en           CleaningSyncService            Cualquier cliente HTTP
              openMAINT (ExtJS, admin)          (cada 15 min + webhook,        que llame al endpoint
                                                 apagado por defecto)          directamente
```

Todo el trabajo con Hostaway —autenticación OAuth2, paginación, filtrado— vive en el backend. La página de openMAINT y la sincronización automática son dos formas de **disparar** ese trabajo; ninguna de las dos habla con Hostaway directamente. La automática crea por el mismo camino que la manual y, además, actualiza y cancela (sección 4).

---

## 2. `HostawayService` — el cliente de la API

`backend/src/integrations/hostaway/hostaway.service.ts`

### Autenticación

OAuth2 *client credentials* contra `POST https://api.hostaway.com/v1/accessTokens`. El token se cachea en memoria y se renueva solo cuando falta menos de 60 s para que expire.

```env
HOSTAWAY_CLIENT_ID=...
HOSTAWAY_CLIENT_SECRET=...
```

Si alguna de las dos falta, `getAccessToken()` lanza antes de intentar la petición. Si vienen con espacios o saltos de línea, se normalizan solas y queda un aviso en el log — problema típico de copiar la credencial desde un panel web.

### `getCheckouts(dateFrom, dateTo)`

Consulta `GET /v1/reservations` con `checkOutDateFrom` / `checkOutDateTo`, y pagina con el cursor `afterId` hasta agotar resultados o llegar a **25 páginas** (`MAX_CHECKOUT_PAGES`) de 100 registros cada una.

Dos cosas que el código corrige porque Hostaway no las hace por su cuenta:

- **Hostaway no filtra de verdad por fecha de checkout** — devuelve las reservas más recientes sin importar el rango pedido. El filtro por `departureDate` se aplica en el propio backend sobre lo que llega.
- **Solo cuentan los estados `new`, `modified` y `confirmed`** (`VALID_RESERVATION_STATUSES`, en `hostaway.constants.ts`; se comparan en minúsculas). Una reserva cancelada no genera tarea.

> Antes de que existiera la paginación, un rango de varios días se truncaba en silencio con una sola página de 100: a ~16 checkouts diarios, una semana ya rozaba el tope y el listado salía incompleto sin ningún error. Quedó anotado en el propio código para que nadie lo "simplifique" de vuelta.

### `getReservationState(id)`

Estado actual de una reserva, para decidir sobre su limpieza. Devuelve `found` (con estado, fecha de salida y alojamiento) o `not_found` (solo ante un 404), y **lanza** si Hostaway no da una respuesta concluyente. `getReservationCheckout` no sirve para esto: devuelve `null` tanto si la reserva no existe como si Hostaway falla.

### Modo mock

```env
HOSTAWAY_USE_MOCK=true
```

Devuelve datos de `hostaway.mock.ts` en vez de llamar a la API real. Es lo que usan las suites E2E. No combinarlo con `HOSTAWAY_SCHEDULER_ENABLED=true`: la sincronización crearía limpiezas de reservas ficticias.

---

## 3. Los dos endpoints del backend

`backend/src/modules/cleaning-tasks/cleaning-tasks.controller.ts` — ambos exigen `x-session-token` de un rol de coordinación (`SuperUser` o `Coordinador`); sin ella responden 401 y con otro rol 403.

### `GET /cleaning-tasks/checkouts` — solo lectura

Consulta sin escribir nada en openMAINT. Acepta `date` (un solo día) o `dateFrom`/`dateTo` (rango); sin ningún parámetro, consulta hoy.

```
GET /cleaning-tasks/checkouts?dateFrom=2026-06-01&dateTo=2026-06-07
```

```json
{
  "date": "2026-06-01",
  "dateFrom": "2026-06-01",
  "dateTo": "2026-06-07",
  "checkouts": [
    {
      "reservationId": "48576920",
      "guestName": "Alice Smith",
      "listingName": "Suite de Lujo frente al mar",
      "listingId": "293847",
      "checkoutDate": "2026-06-03",
      "checkoutTime": "11:00"
    }
  ],
  "count": 1
}
```

Validaciones, ambas con `400`:

- `dateTo` anterior a `dateFrom`.
- Rango mayor a **92 días** (`MAX_CHECKOUT_RANGE_DAYS`) — el mismo límite que la página de openMAINT valida antes de siquiera pedir el listado.

### `POST /cleaning-tasks/sync/today` y `POST /cleaning-tasks/sync`

Traen los checkouts y **generan una tarea de limpieza por cada uno** en openMAINT. `sync/today` es un atajo de `sync` con `dateFrom`/`dateTo` fijados a la fecha actual.

```json
{
  "dateFrom": "2026-06-03",
  "dateTo": "2026-06-03",
  "total": 4,
  "created": 3,
  "skipped": 1,
  "failed": 0
}
```

**Idempotente por diseño.** Antes de crear cada tarea, `taskExistsByReservationId` comprueba si ya existe una para ese `hostawayReservationId`, también cancelada; si existe, cuenta como `skipped` y no duplica. Si falta, `createCleaningTask` vuelve a comprobarlo con un candado por reserva en PostgreSQL (`CleaningReservationLockService`, `pg_advisory_xact_lock`) antes de crearla. Correr la sincronización dos veces sobre el mismo rango es seguro, también a la vez que la automática. El candado solo protege a los procesos que comparten base de datos: dos entornos con bases distintas sobre el mismo openMAINT pueden duplicar.

Si la comprobación falla, la tarea **no se crea** y cuenta como `failed` (antes se daba por inexistente). Crear exige, por tanto, que la base de datos propia esté disponible.

Los checkouts se procesan de diez en diez con `Promise.allSettled` (como mucho dos candados a la vez): un fallo individual queda en `failed` sin tumbar el resto del lote.

---

## 4. Cómo se dispara hoy

### Página personalizada en openMAINT (manual)

`CMDBuildUI.view.custompages.cleaningtasks.CleaningTaskManager` — página ExtJS dentro de la interfaz de administración de openMAINT, con dos secciones:

1. **Sincronización de hoy** — botón que llama a `POST /sync/today`, con confirmación previa. Muestra procesados / creadas / duplicadas / errores al terminar.
2. **Ver próximas limpiezas** — selector de rango (máx. 92 días, validado también del lado del cliente) que llama a `GET /checkouts` y lista el resultado en una grilla de solo lectura.

La URL del backend está fijada en un único lugar, la propia vista:

```js
backendUrl: "https://dt4fm-system.onrender.com",
```

Archivos: `CleaningTaskManager.js` (vista), `CleaningTaskManagerModel.js` (estado), `CleaningTaskManagerController.js` (llamadas HTTP). No están en este repositorio — viven como custom page dentro de openMAINT. Vale la pena versionarlos aquí si se van a seguir tocando.

### Sincronización automática (desactivada por defecto)

`cleaning-sync.service.ts` (lógica) y `hostaway-sync.scheduler.service.ts` (cron), en `backend/src/modules/cleaning-tasks/`. Reemplaza a la ejecución diaria: `HOSTAWAY_SCHEDULER_HOUR` y `HOSTAWAY_SCHEDULER_MINUTE` ya no se leen.

```env
HOSTAWAY_SCHEDULER_ENABLED=true   # solo "true" la enciende
HOSTAWAY_SYNC_DAYS=2              # 1-14, contando hoy; defecto: hoy y mañana
```

**Solo un entorno encendido por cada openMAINT**: dos sobre el mismo duplicarían limpiezas. Pasos de puesta en marcha, con la migración primero: [backend-ci-cd.md](../backend-ci-cd.md#puesta-en-marcha-de-la-sincronización-y-de-la-escritura-de-limpiezas).

Dos disparadores, ambos apagados sin la variable:

- **Barrido** en los minutos 7, 22, 37 y 52, sobre las salidas de la ventana (días de Guayaquil).
- **Señal del webhook** de reservas (`reservations.controller.ts`): no cambia ni retrasa su respuesta. A los 5 s se relee la reserva por su id, así que el orden de los eventos no importa. Las señales van en serie; una que falla la recoge el barrido, si la reserva o su limpieza caen en la ventana.

| Situación | Acción |
|---|---|
| Reserva válida con salida en la ventana y sin limpieza | Crear |
| Cambió la salida, limpieza sin empezar | Actualizar `CheckoutDate`, aunque la nueva salga de la ventana. Si el **día** del inicio planeado es anterior a la nueva salida, quitar operario y horario, y avisar |
| Cambió el alojamiento, sin empezar | Actualizar listing, unidad (vacía si no hay exactamente una) y descripción, si empieza por «Limpieza - ». Un listing vacío en cualquiera de los dos lados no es un cambio |
| Estado explícito de cancelación (`CANCELLED_STATUSES`), sin empezar | Cancelar con «Reserva cancelada en Hostaway», avisar al operario y anular sus supervisiones abiertas |
| Todas sus limpiezas las canceló la sincronización y la reserva revive en la ventana | Crear otra |
| Alguna la canceló una persona o la API | No recrear |
| Limpieza empezada, en pausa, reabierta o terminada; 404 u otro estado en Hostaway | No tocar |

«Sin empezar» es `isUnstartedTask`: `Assigned`, sin inicio real y sin pausa.

- **Ante la duda, no toca nada.** Un fallo de Hostaway o de openMAINT cuenta como fallido y no decide. Nunca cancela porque una reserva falte en un listado: consulta su estado.
- **Relee la tarjeta justo antes de escribir**, y salta la pasada si la sesión de servicio está en enfriamiento.
- **Qué canceló ella** queda en `cleaning_sync_cancellation`, marcado antes de cancelar. La base de datos solo se consulta para crear, cancelar o comprobar una reserva revivida: una pasada sin cambios no la despierta.
- **Solo actúa si cambió Hostaway.** `cleaning_sync_baseline` guarda lo último que dijo de cada reserva: si no cambió, la diferencia con la limpieza la puso una persona y se respeta. Sin esa fila, una limpieza ya planificada tampoco se toca.
- **Estado** en memoria, desde el arranque: `GET /integrations/v1/cleaning-sync` (clave de la API de limpiezas).

---

## 5. Nota sobre autorización

Desde el 2026-11-25, `/checkouts`, `/sync*`, `GET /`, `POST /` y `/generate` exigen sesión de coordinación (antes no pedían nada). **La página ExtJS de openMAINT debe enviar `x-session-token`** con la sesión del usuario, o recibirá 401. Es consistente con que la página de openMAINT tampoco envía credenciales propias — pero es el mismo patrón de fondo que llevó a la corrección de propietarios (`BP-001` en el backlog): un endpoint sin exigir identidad es, por definición, público para cualquiera que lo encuentre.

No se ha registrado todavía como hallazgo propio porque el impacto es menor —no expone datos de personas, y `sync` es idempotente—, pero merece decidirse antes de production: como mínimo, protegerlo con el mismo secreto compartido que ya usa el webhook de IoT (`X-IoT-Secret` es el patrón a replicar, no reutilizar el mismo secreto).

---

## 6. Sobre la carpeta `docs/integrations/Integracion Hostaway/`

Contiene tres archivos de un prototipo temprano (27 de julio) que asumía que la propia página de openMAINT llamaría a la API de Hostaway directamente, sin backend intermedio. Ese diseño no es el que se implementó. Además, la carpeta trae su propio `node_modules` versionado por accidente (584 de los 975 archivos que el repositorio tiene bajo control de versiones) — es el hallazgo `BP-006` del backlog post-piloto.

Ese documento no debe consultarse para entender el flujo actual; este archivo lo reemplaza.
