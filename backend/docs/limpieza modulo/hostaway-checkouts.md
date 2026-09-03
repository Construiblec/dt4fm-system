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
              Página personalizada en           Scheduler diario              Cualquier cliente HTTP
              openMAINT (ExtJS, admin)          (00:00, desactivado           que llame al endpoint
                                                  por defecto)                 directamente
```

Todo el trabajo con Hostaway —autenticación OAuth2, paginación, filtrado— vive en el backend. La página de openMAINT y el scheduler son dos formas de **disparar** ese trabajo; ninguno de los dos habla con Hostaway directamente.

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
- **Solo cuentan los estados `new`, `modified` y `confirmed`** (`VALID_RESERVATION_STATUSES`). Una reserva cancelada no genera tarea.

> Antes de que existiera la paginación, un rango de varios días se truncaba en silencio con una sola página de 100: a ~16 checkouts diarios, una semana ya rozaba el tope y el listado salía incompleto sin ningún error. Quedó anotado en el propio código para que nadie lo "simplifique" de vuelta.

### Modo mock

```env
HOSTAWAY_USE_MOCK=true
```

Devuelve datos de `hostaway.mock.ts` en vez de llamar a la API real. Es lo que usan por defecto las suites E2E y el entorno de staging.

---

## 3. Los dos endpoints del backend

`backend/src/modules/cleaning-tasks/cleaning-tasks.controller.ts` — ninguno de los dos exige cabecera de sesión.

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

**Idempotente por diseño.** Antes de crear cada tarea, `taskExistsByReservationId` comprueba si ya existe una para ese `hostawayReservationId`; si existe, cuenta como `skipped` y no duplica. Correr la sincronización dos veces sobre el mismo rango es seguro — es justo lo que la página de openMAINT y el scheduler hacen sin coordinarse entre sí.

Cada checkout se procesa con `Promise.allSettled`: un fallo individual queda en `failed` sin tumbar el resto del lote.

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

### Scheduler diario (automático, desactivado por defecto)

`backend/src/modules/cleaning-tasks/hostaway-sync.scheduler.service.ts`

```env
HOSTAWAY_SCHEDULER_ENABLED=true
HOSTAWAY_SCHEDULER_HOUR=0      # opcional, defecto medianoche
HOSTAWAY_SCHEDULER_MINUTE=0
```

Con la variable en `true`, corre `syncFromHostaway(hoy, hoy)` a la hora configurada y se reprograma solo para el día siguiente. Con la página manual ya cubriendo el piloto, no hace falta activarlo — pero conviene decidirlo a propósito antes de producción, no dejarlo en su valor por defecto sin más.

---

## 5. Nota sobre autorización

Ninguno de los dos endpoints (`/checkouts`, `/sync*`) exige sesión ni ninguna otra cabecera. Cualquiera con la URL del backend puede disparar una sincronización o leer el calendario de reservas. Es consistente con que la página de openMAINT tampoco envía credenciales propias — pero es el mismo patrón de fondo que llevó a la corrección de propietarios (`BP-001` en el backlog): un endpoint sin exigir identidad es, por definición, público para cualquiera que lo encuentre.

No se ha registrado todavía como hallazgo propio porque el impacto es menor —no expone datos de personas, y `sync` es idempotente—, pero merece decidirse antes de production: como mínimo, protegerlo con el mismo secreto compartido que ya usa el webhook de IoT (`X-IoT-Secret` es el patrón a replicar, no reutilizar el mismo secreto).

---

## 6. Sobre la carpeta `docs/integrations/Integracion Hostaway/`

Contiene tres archivos de un prototipo temprano (27 de julio) que asumía que la propia página de openMAINT llamaría a la API de Hostaway directamente, sin backend intermedio. Ese diseño no es el que se implementó. Además, la carpeta trae su propio `node_modules` versionado por accidente (584 de los 975 archivos que el repositorio tiene bajo control de versiones) — es el hallazgo `BP-006` del backlog post-piloto.

Ese documento no debe consultarse para entender el flujo actual; este archivo lo reemplaza.
