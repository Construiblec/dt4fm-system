# Videovigilancia en vivo

Muestra una cámara en vivo al Supervisor CAV y deja constancia de quién miró qué cámara y cuándo.
El backend autoriza y registra; la VPS entrega el video al navegador.

| Documento | Para qué |
|---|---|
| Este | Qué hace el módulo y cómo está construido |
| [decisiones-arquitectura-y-seguridad.md](decisiones-arquitectura-y-seguridad.md) | Por qué está construido así. V-01 a V-10, cerradas |
| [live-integration-dt4fm.md](live-integration-dt4fm.md) | De IoT, para DT4FM: qué hacen el backend y el frontend. **Si diverge de este README, manda ese** |
| [openapi.yaml](openapi.yaml) | De IoT: el contrato exacto de la API central, campo por campo. Incluye accesos |
| [live-video.md](live-video.md) | De IoT: el diseño completo, los límites y qué está verificado |
| [gateway-contract-live.md](gateway-contract-live.md) | De IoT, para el gateway de cada edificio. Aquí solo como contexto |
| [nota-origenes-video.md](nota-origenes-video.md) | Para IoT: los orígenes que deben dar de alta en `live.construiblec.cloud` |
| [pruebas/](pruebas/) | Casos `VID-xx` y cómo ejecutarlos |
| [Frontend](../../../frontend/modulo-incidentes/docs/videovigilancia-en-vivo.md) | La pantalla, el cliente WHEP y sus estados |

Los cuatro documentos de IoT están tal como llegaron (02-10-2026) y no se editan aquí. Enlazan a
otros que siguen solo en su repositorio: `backend-integration-notes.md`,
`gateway-contract-operations.md`, `approved-decisions-v1.md` y los diagramas de `docs/diagram/`.

---

## 1. El reparto

```text
Navegador ──1. "ver cámara"──▶ Backend DT4FM ──2. POST live-sessions──▶ iot.construiblec.cloud
Navegador ◀──3. la sesión───── Backend DT4FM ◀───────────────────────
Navegador ──4. oferta SDP + ticket─────────────────────────────────────▶ live.construiblec.cloud
Navegador ◀══5. video (WebRTC, solo por el TURN de Cloudflare)══════════
```

| Hostname | Quién lo llama | Autenticación |
|---|---|---|
| `iot.construiblec.cloud` | Solo el backend | Service token de Cloudflare Access (el mismo de accesos) |
| `live.construiblec.cloud` | Solo el navegador | El `ticket` de la sesión |

**La VPS no conoce operadores ni guarda quién vio qué.** Si el backend no registra una
visualización, no queda en ningún sitio. Por eso la fila se escribe **antes** de pedir la sesión
(V-02). El `requestId` de esa fila aparece en el log de la VPS: une los dos registros.

El video no pasa por el backend, ni por la API central: va del relay de la VPS (MediaMTX) al
navegador por el TURN de Cloudflare, y el relay lo pide al gateway del edificio por Tailscale. El
backend tampoco ve el resultado de la negociación: si la cámara no da señal, lo sabe la VPS, y se
cruza por `requestId`.

## 2. Alcance

**Dentro.** Catálogo de cámaras por edificio, una cámara en vivo a la vez, registro de cada
visualización e historial para SuperUser.

**Fuera.** Grabaciones, audio, PTZ y cuadrícula de varias cámaras: la VPS no los ofrece en esta
versión, y una cuadrícula no cabe en sus 5 sesiones para todos los edificios.

**Los gateways todavía no entregan video.** Mientras tanto `GET /v1/cameras` responde `[]`, y la
pantalla dice «Aún no hay cámaras en vivo». No es un error.

## 3. Código

| Pieza | Dónde |
|---|---|
| Cliente de la VPS | `listCameras` y `createLiveSession` en [access-iot.client.ts](../../src/modules/access-control/access-iot.client.ts). El mismo `AccessIotGateway` que accesos (V-05) |
| Mock | [access-iot.mock.ts](../../src/modules/access-control/access-iot.mock.ts): `ING-CAM-01/02`, `PRA-CAM-01/02`. **`PRA-CAM-02` responde siempre `live_capacity_reached`** |
| Módulo | [video-surveillance/](../../src/modules/video-surveillance/) |
| Catálogo | [camera-catalog.service.ts](../../src/modules/video-surveillance/camera-catalog.service.ts), en memoria (V-06) |
| Sesión y registro | [live-session.service.ts](../../src/modules/video-surveillance/live-session.service.ts) |
| Historial | [video-views.service.ts](../../src/modules/video-surveillance/video-views.service.ts) |
| Rutas | [cameras.controller.ts](../../src/modules/video-surveillance/cameras.controller.ts) |

## 4. Modelo de datos

Una tabla, `live_view_request`
([migración](../../src/database/migrations/1789400000000-CreateLiveViewRequest.ts)): una fila por
clic.

| Columna | |
|---|---|
| `request_id` | UUID del cliente, en minúsculas. Único: un clic, una visualización |
| `camera_id` | Como lo da la VPS (`ING-CAM-01`) |
| `building_id` | `Building._id` de openMAINT. Nulo solo si la cámara no estaba en el catálogo al pedirla; se completa con la respuesta |
| `actor_username` | Usuario de openMAINT. Es el único registro de quién miró |
| `status` | `requested` → `issued` o `failed` |
| `error_code` | El código de la VPS (§5), o `timeout`, `network`, `invalid_response`, `internal_error` |
| `requested_at` / `finished_at` | Cuándo se pidió y cuándo respondió la VPS |

**No tiene columna para el `ticket` ni para la credencial TURN**, y no debe tenerla (V-03).
`issued` dice que se entregó una sesión, no que el operador llegara a ver imagen.

## 5. Endpoints

Todos con la sesión de openMAINT en `Authorization` (sin esquema) o en `x-session-token`. El rol se
resuelve contra openMAINT, nunca desde una cabecera del cliente.

| Ruta | Rol | Nota |
|---|---|---|
| `GET /cameras` | SupervisorCAV, SuperUser | `{enabled, stale, buildings: [{buildingId, name, reachable, cameras}]}` |
| `POST /cameras/:cameraId/live-sessions` | SupervisorCAV, SuperUser | Cuerpo `{requestId}`. `201` con la sesión de la VPS tal cual y `Cache-Control: no-store` |
| `GET /cameras/views` | SuperUser | Filtros `cameraId`, `username`, `buildingId`, `from` (incluido), `to` (excluido), `limit` ≤ 200 |

`reachable: false` significa que el gateway de ese edificio no aportó cámaras en la última
consulta; sus cámaras se siguen mostrando con «sin conexión» (V-06). `stale: true`, que la VPS no
respondió y se sirve lo conocido.

**Errores de `POST /cameras/:cameraId/live-sessions`.** Cuerpo `{statusCode, code, message}`. El
frontend decide por `code`, nunca por `message`.

| VPS | Backend | `code` | Qué hace el backend |
|---|---|---|---|
| — | `503` | `live_disabled` | `LIVE_VIDEO_ENABLED` apagado. No registra |
| — | `400` | `invalid_request` | `cameraId` fuera de `^[A-Z0-9][A-Z0-9-]{0,63}$` (el patrón de `openapi.yaml`) o `requestId` no UUID. No registra |
| — | `409` | `duplicate_request` | `requestId` ya usado. No pide otra sesión |
| `400 invalid_request` | `502` | `invalid_request` | `logger.error`: error de integración |
| `404 not_found` | `404` | `not_found` | Retira la cámara del catálogo |
| `500 device_ambiguous` | `502` | `device_ambiguous` | `logger.error`: dos edificios declaran la cámara |
| `503 gateway_unreachable` | `503` | `gateway_unreachable` | |
| `503 live_capacity_reached` | `503` | `live_capacity_reached` | |
| `503 live_unavailable` | `503` | `live_unavailable` | |
| `302`/`401`/`403` | `503` | `live_unavailable` | `logger.error`: service token rechazado |
| Plazo de 10 s, red | `503` | `live_unavailable` | |
| `201` fuera de contrato | `502` | `live_unavailable` | `logger.error`. La sesión no se entrega |

Todos los fallos de la VPS quedan en la fila como `failed` con su código, y todos se pueden
reintentar con un `requestId` nuevo: ninguno deja una sesión a medias.

**Plazo.** La VPS consulta a los gateways (2 s) y a Cloudflare (5 s); el cliente corta a los 10 s
y **no reintenta** (V-04). `GET /v1/cameras` sí usa los reintentos normales del cliente.

## 6. La pantalla

`/supervisor-cav/camaras`, pestaña **Cámaras** del panel CAV. Detalle en el
[documento del frontend](../../../frontend/modulo-incidentes/docs/videovigilancia-en-vivo.md). Las
reglas que vienen del contrato de IoT:

| Regla | Cómo se cumple |
|---|---|
| **Un ticket, una oferta** | Cada clic, también «Continuar» y «Reintentar», pide otra sesión al backend |
| **60 s** entre recibir la sesión y enviar la oferta | La sesión se pide al pulsar «Ver», nunca al cargar la pantalla |
| **Cerrar al salir** | Cambiar de cámara o de edificio, cerrar el visor o abandonar la página manda el `DELETE` |
| **300 s** por sesión | Cuenta atrás visible; al cumplirse, «Sesión finalizada» y botón **Continuar**. Nada reconecta solo |
| **Una cámara a la vez** | Un único visor: abrir otra cierra la anterior |
| **`iceTransportPolicy: "relay"`** | Se usa el que manda la sesión, sin tocarlo |

## 7. Variables de entorno

| Variable | |
|---|---|
| `LIVE_VIDEO_ENABLED` | `false` por defecto. Solo `true` deja pedir sesiones; el catálogo se ve igual, con el aviso «desactivado» |
| `ACCESS_IOT_URL`, `ACCESS_IOT_TOKEN`, `ACCESS_IOT_USE_MOCK` | Las de accesos: es la misma VPS (V-05) |

El frontend no necesita variables nuevas: `whepUrl` llega en cada sesión.

**Cada origen desde el que se abra el panel tiene que estar dado de alta en IoT**, o la negociación
recibe `403`. Los tres de hoy están en la [nota de orígenes](nota-origenes-video.md). Un dominio
nuevo de producción o de pruebas es una petición a IoT antes del despliegue.

## 8. Pruebas

```bash
docker compose up -d && npm run migration:run
npm test -- access-iot video-surveillance          # cliente, mock y catálogo
npm run test:e2e -- video-surveillance              # endpoints, registro y errores
```

La E2E comprueba, además de los códigos, que **ni el ticket ni la credencial TURN aparecen en
`live_view_request`**: el doble de la VPS los marca con `TICKET-SECRETO` y `TURN-SECRETO`.

A mano: backend con `ACCESS_IOT_USE_MOCK=true` y `LIVE_VIDEO_ENABLED=true`, o solo el frontend con
`VITE_CAV_MOCK=true`, que simula el video con un lienzo. Los casos de campaña están en
[pruebas/](pruebas/).

## 9. Lo que aún no existe

- **Video de los gateways.** IoT tiene que implementar su parte
  ([gateway-contract-live.md](gateway-contract-live.md)); hasta entonces no hay imagen real.
- **`live.construiblec.cloud` responde `404`.** El hostname existe pero el túnel aún no lo enruta
  ([live-video.md](live-video.md), «Estado de la verificación»). La pantalla lo muestra como
  «Video no disponible».
- **Un navegador en modo `relay` contra el relay real.** IoT solo lo probó en local. Es la única
  ruta del video; si no conecta, el arreglo es del lado de la VPS (cortafuegos o TURN para el
  relay), no del frontend.
- **Un NVR real.** El perfil H.264, el intervalo de I-frame y la latencia por Tailscale están sin
  medir. Un sub-stream en H.265 o con B-frames no se vería: es un ajuste del grabador.
- **Límite de peticiones en `live.construiblec.cloud`.** Pendiente de IoT. El backend no limita la
  frecuencia por operador; si un cliente en bucle agota los 5 cupos, es el primer sitio donde
  ponerlo.
- **Pantalla de historial.** `GET /cameras/views` existe; la pantalla no.
- **Desenlace de la negociación.** El backend sabe que entregó la sesión, no si hubo imagen. Si
  hace falta, el frontend puede informarlo con el mismo `requestId`.
