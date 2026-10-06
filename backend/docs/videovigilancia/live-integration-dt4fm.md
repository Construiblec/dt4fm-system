# Video en vivo: integración para DT4FM

**Para quien mantiene el backend y el frontend de DT4FM.**

Cómo mostrar una cámara en vivo a un operador. El contrato exacto, campo por
campo, está en `openapi.yaml`; el diseño completo, en
[`live-video.md`](live-video.md). Lo demás de la API central sigue como en
[las notas de integración](backend-integration-notes.md).

## Estado

| Operación | En producción |
|---|---|
| `GET /v1/cameras` | No: implementado, pendiente de despliegue |
| `POST /v1/cameras/{cameraId}/live-sessions` | No: implementado, pendiente de despliegue |
| Negociación en `live.construiblec.cloud` | No: implementado, pendiente de despliegue |

Los gateways todavía no entregan video. Hasta entonces `GET /v1/cameras`
responde una lista vacía, y eso no es un error.

## El reparto, en una frase

**El backend decide qué operador puede mirar qué cámara y lo registra. La VPS
entrega el video a quien traiga el ticket que el backend pidió.**

La API central no conoce operadores, no guarda quién vio qué y no ofrece un
histórico. Si el backend no registra una visualización, no queda registrada en
ningún sitio.

```text
Frontend ──1. "ver cámara"──▶ Backend ──2. POST live-sessions──▶ iot.construiblec.cloud
Frontend ◀──3. la respuesta── Backend ◀────────────────────────
Frontend ──4. oferta SDP + ticket────────────────────────────▶ live.construiblec.cloud
Frontend ◀══5. video (WebRTC, por el TURN de Cloudflare)══════
```

Dos hostnames, y no son intercambiables:

| Hostname | Quién lo llama | Autenticación |
|---|---|---|
| `iot.construiblec.cloud` | Solo el backend | Cloudflare Access, service token |
| `live.construiblec.cloud` | Solo el navegador | El ticket |

El frontend nunca llama a `iot.construiblec.cloud`, y el service token nunca
llega al navegador.

## Backend

### Catálogo: `GET /v1/cameras`

Opcionalmente `?buildingId=<Building._id>`.

```json
[
  {"cameraId": "ING-CAM-01", "name": "Acceso vehicular", "buildingId": 3025058},
  {"cameraId": "ING-CAM-02", "name": "Lobby", "buildingId": 3025058}
]
```

- `cameraId` es estable y único entre edificios. Es lo que se guarda.
- Un edificio cuyo gateway no responde **no aporta cámaras**, igual que en
  `/v1/devices`. Una lista corta no significa que las cámaras ya no existan:
  no borren su catálogo a partir de una respuesta. `/v1/health` dice si el
  gateway está caído.
- Un `buildingId` fuera del catálogo devuelve `[]`, sin error.
- No hay estado por cámara. Si una no da señal, se sabe al intentar verla.

### Sesión: `POST /v1/cameras/{cameraId}/live-sessions`

Antes de llamar, el backend ya comprobó que ese operador puede ver esa cámara.

```http
POST /v1/cameras/ING-CAM-01/live-sessions
Content-Type: application/json

{"requestId": "6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13"}
```

`requestId` es un UUID canónico en minúsculas, **uno nuevo por cada clic del
operador**. Es el identificador de esa visualización en su auditoría, y
aparece en el log de la VPS: une los dos registros.

Respuesta `201`:

```json
{
  "requestId": "6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13",
  "cameraId": "ING-CAM-01",
  "buildingId": 3025058,
  "whepUrl": "https://live.construiblec.cloud/v1/live/ING-CAM-01/whep",
  "ticket": "eyJhbGciOi…",
  "ticketExpiresAt": "2026-10-01T20:05:32.629674+00:00",
  "maxDurationSeconds": 300,
  "iceServers": [
    {
      "urls": ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
      "username": "…",
      "credential": "…"
    }
  ],
  "iceTransportPolicy": "relay"
}
```

**Qué hacer con ella:**

- Entregarla al frontend tal cual, en la respuesta de su propio endpoint.
- **No guardarla ni registrarla.** El `ticket` y la `credential` son secretos
  de corta vida: fuera de la base, de los logs y de cualquier caché.
- No reutilizarla. Cada visualización, y cada reintento, pide una nueva.
- Registrar la visualización **antes** de responder al frontend: operador,
  `cameraId`, `buildingId`, `requestId` y hora.

**Plazo.** La llamada pregunta a los gateways (2 s) y a Cloudflare (5 s).
Corten a los 10 s.

**Errores.** Ninguno deja una sesión a medias, así que todos se pueden
reintentar con un `requestId` nuevo.

| Estado | `code` | Significa | Qué mostrar |
|---|---|---|---|
| 400 | `invalid_request` | `cameraId` o cuerpo mal formados | Error de integración: alertar |
| 404 | `not_found` | Ningún gateway tiene esa cámara | La cámara ya no existe: refrescar el catálogo |
| 500 | `device_ambiguous` | Dos edificios declaran esa cámara | Alertar a Sistemas |
| 503 | `gateway_unreachable` | No se pudo saber de quién es | "Edificio sin conexión" |
| 503 | `live_capacity_reached` | Las 5 sesiones están en uso | "Hay demasiadas cámaras abiertas" |
| 503 | `live_unavailable` | El servicio de video no está disponible | "Video no disponible"; alertar si persiste |

Como en el resto de la API, si el service token no es válido responde
Cloudflare con un `302`, no esta API.

## Frontend

### Requisitos

- **`iceTransportPolicy: "relay"` es obligatorio.** El relay de la VPS no
  acepta conexiones directas desde internet: sin esa política la sesión no
  conecta, o tarda en fallar.
- El origen de la página debe estar en la lista de la VPS. **Dígannos los
  orígenes exactos** de producción, de pruebas y de desarrollo local
  (`https://…`, sin ruta). Uno que no figure recibe `403`.
- Si la aplicación tiene Content-Security-Policy, añadir
  `connect-src https://live.construiblec.cloud`.
- El elemento `<video>` necesita `autoplay`, `muted` y `playsinline`. Sin
  `muted` el navegador bloquea la reproducción automática. No hay audio.

### Cliente de referencia

WHEP sin trickle: se espera a reunir los candidatos y se envía una sola
oferta. Es lo más simple y aquí no cuesta nada, porque solo hay candidatos de
relay.

```js
// session: la respuesta del backend, tal cual.
async function watchCamera(videoElement, session) {
  const pc = new RTCPeerConnection({
    iceServers: session.iceServers,
    iceTransportPolicy: session.iceTransportPolicy, // "relay"
  });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.ontrack = (event) => {
    videoElement.srcObject = event.streams[0] ?? new MediaStream([event.track]);
  };

  await pc.setLocalDescription(await pc.createOffer());
  await gatheringComplete(pc, 4000);

  const response = await fetch(session.whepUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      Authorization: `Bearer ${session.ticket}`,
    },
    body: pc.localDescription.sdp,
  });
  if (response.status !== 201) {
    pc.close();
    throw await response.json(); // {code, message}
  }

  // Location es relativa al hostname de video.
  const resource = new URL(response.headers.get("Location"), session.whepUrl);
  await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });

  return {
    pc,
    async close() {
      pc.close();
      // keepalive: que el cierre salga aunque la página se esté yendo.
      await fetch(resource, { method: "DELETE", keepalive: true }).catch(() => {});
    },
  };
}

function gatheringComplete(pc, timeoutMs) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, timeoutMs);
  });
}
```

### Reglas de uso

- **Un ticket, una oferta.** Se gasta con la primera oferta aceptable, arranque
  o no la cámara. Para reintentar se vuelve al backend, que emite otra sesión y
  deja otro registro. No reenvíen la misma oferta.
- **60 segundos.** Entre recibir la sesión y enviar la oferta. Pídanla cuando
  el operador pulsa, no al cargar la pantalla ni por adelantado para una
  cuadrícula.
- **Cierren al salir.** `close()` al cambiar de cámara, cerrar el visor o
  abandonar la página. Libera uno de los 5 cupos y deja de tirar del grabador.
  Si no se cierra, la sesión termina sola cuando el navegador desconecta.
- **300 segundos.** Al cumplirlos la VPS corta la sesión, con hasta 15 s de
  margen. `pc.connectionState` pasa a `disconnected` o `failed`. Muestren
  "sesión finalizada" con un botón para continuar, que pide otra sesión: no
  reconecten solos, porque cada sesión es una visualización registrada.
- **Una cámara a la vez por operador.** Hay 5 sesiones para todos los edificios
  y 2 espectadores por cámara. Una cuadrícula de ocho cámaras en vivo no cabe.

### Errores de la negociación

Todos llegan como JSON `{"code", "message"}`, con cabeceras CORS para que la
página pueda leerlos.

| Estado | `code` | Significa | Qué hacer |
|---|---|---|---|
| 400 | `invalid_request` | La oferta no es un SDP aceptable | Error del cliente: corregirlo y pedir otra sesión |
| 401 | `unauthorized` | Ticket ausente, caducado, de otra cámara o ya usado | Pedir otra sesión al backend |
| 403 | `unauthorized` | El origen de la página no está permitido | Avisar a Sistemas: falta dar de alta el origen |
| 502 | `camera_unreachable` | El edificio no entregó el video en 10 s | "Cámara sin señal". Reintentar pide otra sesión |
| 503 | `live_capacity_reached` | No quedan cupos, o la cámara ya tiene 2 espectadores | "Hay demasiadas cámaras abiertas" |
| 503 | `live_unavailable` | El servicio de video no está disponible | "Video no disponible" |

La respuesta a una oferta puede tardar hasta 10 segundos: es lo que se espera a
que el grabador entregue el primer cuadro. Un indicador de carga basta; no
corten antes de 15.

### Redes restringidas

Los `iceServers` incluyen TURN por UDP 3478 y, para redes que lo bloquean, por
TCP 80 y TLS 443. Un operador detrás de un proxy que solo deje salir HTTPS
conecta por `turns:…:443`, con algo más de latencia.

## Lo que falta

- Los gateways tienen que implementar su parte
  ([contrato](gateway-contract-live.md)).
- La prueba con credenciales reales de Cloudflare TURN y un navegador real.
- Límite de peticiones en el hostname de video.
- Grabaciones, audio y PTZ no están previstos en esta versión.
