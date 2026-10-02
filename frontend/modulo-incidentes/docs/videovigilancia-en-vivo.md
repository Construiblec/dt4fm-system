# Videovigilancia en vivo – Frontend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

La pestaña **Cámaras** del panel del Supervisor CAV (`/supervisor-cav/camaras`) muestra una cámara
de un edificio en vivo. Pueden entrar SupervisorCAV y SuperUser.

El video **no pasa por el backend**. El backend autoriza, registra la visualización y devuelve una
sesión; con ella, el navegador negocia el video directamente con `live.construiblec.cloud` por
WebRTC (WHEP), siempre a través del TURN de Cloudflare.

El contrato, las decisiones y los endpoints están en
[backend/docs/videovigilancia/](../../../backend/docs/videovigilancia/README.md). Este documento
cubre la pantalla.

---

## 2. Por qué el diseño quedó así

### Una cámara a la vez, y la sesión se pide al pulsar

La VPS tiene 5 sesiones para todos los edificios y 2 espectadores por cámara: una cuadrícula no
cabe. Y el ticket de una sesión caduca a los 60 s, así que pedirlo al cargar la pantalla lo
gastaría. Por eso hay un único visor y la sesión sale del clic en **Ver**.

### Nada reconecta solo

Cada sesión es una visualización registrada en el backend. Al cumplir los `maxDurationSeconds`
(300 s) o caer la conexión, la pantalla muestra «Sesión finalizada» y un botón **Continuar**. Un
error muestra **Reintentar**. Los dos piden una sesión nueva con un `requestId` nuevo.

### El `<video>` está siempre montado y visible

El cliente WHEP necesita el elemento antes de recibir la pista, y Chrome pausa el autoplay de un
video oculto. Los estados (elige, conectando, error, fin) son una capa encima del video, no un
reemplazo.

---

## 3. Arquitectura

Todo vive en `src/modules/supervisor-cav/`.

| Archivo | Qué hace |
|---|---|
| `pages/LiveCamerasPage.tsx` | Edificio, visor y lista de cámaras. Cambiar de edificio o actualizar cierra la sesión |
| `components/CameraViewer.tsx` | El `<video autoplay muted playsinline>` y la capa de estado. Badge «En vivo» con la cuenta atrás |
| `components/BuildingSelect.tsx` | Compartido con Puertas. Recibe `{buildingId, name, online}`; aquí `online` es `reachable` |
| `hooks/useCameras.ts` | Carga el catálogo (`GET /cameras`) |
| `hooks/useLiveCamera.ts` | La máquina de estados de una visualización |
| `services/camerasService.ts` | `listCameras` y `createLiveSession` contra el backend |
| `services/whepClient.ts` | El cliente WHEP de referencia de IoT, con plazo y errores tipados |
| `utils/liveVideoMessages.ts` | Código de error → mensaje y acción (`retry`, `refresh`, `none`) |
| `services/*.mock.ts` | Con `VITE_CAV_MOCK=true`: catálogo, sesión y un lienzo con la hora en lugar del video |

### La máquina de estados (`useLiveCamera`)

```text
idle ──Ver──▶ requesting ──sesión──▶ connecting ──primer cuadro──▶ live
                  │                       │                          │
                  └──error del backend────┴──error de WHEP──▶ error   ├─ 300 s o conexión caída ─▶ ended
                                                                      └─ ✕, otra cámara, otro edificio ─▶ idle
```

- Cada **Ver**, **Continuar** o **Reintentar** incrementa un contador de intento. Una respuesta
  tardía de un intento anterior se descarta y su conexión se cierra.
- La cuenta atrás empieza con el evento `playing` del video, no con la sesión.
- Al llegar a cero se cierra la sesión desde aquí; la VPS cortaría igual, con hasta 15 s de margen.
- `pagehide` y el desmontaje cierran la conexión. El `DELETE` lleva `keepalive` para salir aunque
  la página se esté yendo.

### El cliente WHEP (`whepClient.ts`)

Es el de [live-integration-dt4fm.md](../../../backend/docs/videovigilancia/live-integration-dt4fm.md),
con tres añadidos:

- **Plazo de 15 s** para la respuesta a la oferta. La VPS puede tardar 10 esperando el primer
  cuadro.
- **`WhepError {status, code}`**. `status` 0 es `timeout` o `network`.
- **`onEnded`**: `connectionState` en `disconnected` o `failed` termina la sesión.

`iceServers` e `iceTransportPolicy` se usan tal como llegan. La política es `relay`: sin ella la
sesión no conecta.

---

## 4. Errores

Dos orígenes, dos tablas en `liveVideoMessages.ts`:

| Al pedir la sesión (backend) | Mensaje | Acción |
|---|---|---|
| `not_found` | La cámara ya no existe. | Actualizar lista |
| `gateway_unreachable` | Edificio sin conexión. | Reintentar |
| `live_capacity_reached` | Hay demasiadas cámaras abiertas… | Reintentar |
| `live_unavailable` | Video no disponible. | Reintentar |
| `live_disabled` | La videovigilancia en vivo está desactivada. | — |
| `device_ambiguous`, `invalid_request` | … Avisa a Sistemas. | — |
| `403` sin código | No tienes permiso para ver las cámaras. | — |

| Al negociar (WHEP) | Mensaje | Acción |
|---|---|---|
| `401` | La sesión de video caducó. | Reintentar |
| `403` | Este sitio no está autorizado para ver video. Avisa a Sistemas. | — |
| `camera_unreachable` | Cámara sin señal. | Reintentar |
| `not_found` | La cámara dejó de estar disponible. | Reintentar |
| Cualquier otro, o sin cuerpo JSON | Video no disponible. | Reintentar |
| `live_capacity_reached` | … o esta ya tiene dos espectadores. | Reintentar |
| `timeout` / `network` | La cámara no respondió a tiempo / No se pudo conectar… | Reintentar |
| `400` | El navegador no pudo negociar el video. Avisa a Sistemas. | — |

**El `403` de WHEP es el origen de la página, no el ticket.** Reintentar no lo arregla: falta dar
de alta el dominio en IoT (§6).

---

## 5. Testing

```bash
npm test          # liveVideoMessages.test.ts, entre otros
npm run build
```

`RTCPeerConnection` no existe en el entorno `node` de Vitest, así que el cliente WHEP y el hook no
tienen prueba automática. Lo puro —la traducción de errores— sí.

### Verificación manual

Con `VITE_CAV_MOCK=true npm run dev` y una sesión `SupervisorCAV` en `localStorage`:

- **Ver** muestra el lienzo con «En vivo» y la cuenta atrás (30 s en el mock).
- Al llegar a cero: «Sesión finalizada» y **Continuar**, que abre otra sesión.
- Ver otra cámara detiene la anterior; cambiar de edificio cierra el visor.
- Pradera → `PRA-CAM-02`: «Hay demasiadas cámaras abiertas» con **Reintentar**.

Verificado así en Chrome con viewport de 390 px el 2026-10-02. El video real depende de que los
gateways lo entreguen; los casos de campaña están en
[definicion-pruebas-video.md](../../../backend/docs/videovigilancia/pruebas/definicion-pruebas-video.md).

---

## 6. Despliegue

- **Sin variables nuevas.** `whepUrl` llega en cada sesión.
- **Cada origen tiene que estar dado de alta en IoT.** Hoy: `http://localhost:5173`,
  `https://dt4fm-staging.vercel.app` y `https://dt4fm-system-f7cc.vercel.app`. Las *previews* de
  Vercel y los túneles `*.trycloudflare.com` reciben `403` en la negociación.
- **`construiblec.cloud`, `www.construiblec.cloud` y `187.77.250.224:8091` quedan fuera a
  propósito.** La aplicación carga desde ellos, pero las cámaras no se ven: **Ver** muestra «Este
  sitio no está autorizado para ver video».
- **No hay Content-Security-Policy.** Si se añade, debe incluir
  `connect-src https://live.construiblec.cloud` además del backend.
- **El service worker no interfiere.** No tiene caché en tiempo de ejecución y solo intercepta
  navegaciones; el `fetch` a `live.construiblec.cloud` pasa directo.

---

## 7. Limitaciones conocidas / fuera de alcance

- Sin audio, grabaciones, PTZ ni cuadrícula: la VPS no los ofrece en esta versión.
- Sin pantalla de historial. El backend expone `GET /cameras/views` para SuperUser.
- La pantalla no informa al backend si hubo imagen: el registro dice que se entregó la sesión. El
  resultado de la negociación está en el log de la VPS, con el mismo `requestId`.
