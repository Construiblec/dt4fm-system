# Video en vivo de cámaras

Cómo un operador de DT4FM ve una cámara de un edificio, qué pieza hace cada
cosa y qué decisiones aprobadas cambian por ello.

Dos documentos salen de este y se entregan a quien construye el otro lado:

- [Contrato para el gateway](gateway-contract-live.md), para el encargado de IoT.
- [Integración para DT4FM](live-integration-dt4fm.md), para backend y frontend.

Los diagramas están en `docs/diagram/`:
`video-arquitectura.drawio`, `dt4fm-secuencia-video.drawio` y
`video-red-y-seguridad.drawio`.

## Alcance de esta versión

| Sí | No |
|---|---|
| Ver en vivo una cámara, desde el panel de DT4FM | Grabaciones o reproducción del histórico del NVR |
| Operadores y staff | Residentes y huéspedes |
| Sub-stream H.264 tal cual lo entrega el NVR | Audio, PTZ, transcodificación |
| Latencia inferior a un segundo (WebRTC) | Registro de quién vio qué: lo lleva el backend |

Uso esperado: 8 cámaras por edificio, una a la vez y en contadas ocasiones.

## El reparto

```text
Backend DT4FM         decide qué operador puede mirar y lo registra
     │  service token (Cloudflare Access)
     ▼
API central (VPS)     dice de qué edificio es la cámara, emite el ticket,
     │                valida al navegador y negocia con el relay
     ▼
Relay (MediaMTX, VPS) pide el video al gateway y lo entrega por WebRTC
     │  RTSP por Tailscale
     ▼
Gateway del edificio  pide el sub-stream al NVR y lo re-sirve por RTSP
     │  RTSP en la LAN
     ▼
NVR Hikvision / Dahua
```

Tres reglas sostienen ese reparto:

1. **El gateway no sale a internet.** Solo habla por Tailscale, así que el
   video cruza la VPS: no hay otro camino hasta el navegador.
2. **La VPS no toca la LAN** (§1.11). Lee el video del gateway, nunca del NVR.
   `liveUrl` debe apuntar al mismo host que `gatewayUrl`, y el registro lo
   rechaza si no. La credencial admin del NVR no sale del edificio.
3. **El navegador no llega al relay.** La negociación pasa por la API central,
   que es el único punto de autenticación, y el video pasa por el servicio TURN
   de Cloudflare. El relay escucha en loopback.

## El camino de una visualización

1. El operador pulsa "ver cámara". El frontend se lo pide **a su backend**.
2. El backend comprueba permisos, lo registra y llama a
   `POST /v1/cameras/{cameraId}/live-sessions` con su service token.
3. La API central pregunta a los gateways quién tiene esa cámara, pide a
   Cloudflare una credencial TURN para esta sesión y firma un **ticket**.
   No arranca nada.
4. El backend devuelve la respuesta al frontend, sin guardarla.
5. El navegador crea su `RTCPeerConnection` en modo `relay` con los
   `iceServers` recibidos y envía su oferta SDP a `whepUrl`, con el ticket.
6. La API central valida el origen y el ticket, lo gasta, le dice al relay de
   dónde sale esa cámara y reenvía la oferta.
7. El relay pide el RTSP al gateway, que lo pide al NVR. Con el primer cuadro
   responde la oferta. La API devuelve esa respuesta al navegador.
8. El video fluye relay → TURN → navegador. A los 300 segundos la API corta la
   sesión; para seguir mirando se pide otra.

El video nunca pasa por la API central. Por ella pasan unos pocos kilobytes de
negociación.

## Endpoints

El contrato exacto está en `openapi.yaml`.

| Ruta | Quién | Autenticación |
|---|---|---|
| `GET /v1/cameras[?buildingId=]` | Backend u operador | Access: `machine_or_operator` |
| `POST /v1/cameras/{cameraId}/live-sessions` | Backend | Access: `machine_only` |
| `POST /v1/live/{cameraId}/whep` | Navegador | Ticket (Bearer) y origen permitido |
| `PATCH`, `DELETE /v1/live/sessions/{sessionToken}` | Navegador | El token de la ruta y origen permitido |
| `OPTIONS` de las dos anteriores | Navegador | Origen permitido |

Las dos últimas viven en el hostname de video, `live.construiblec.cloud`, que
**no está detrás de Cloudflare Access**: un navegador no tiene aserción que
presentar. El túnel solo debe enrutar ahí el prefijo `/v1/live/`.

### El ticket

Un JWT HS256 firmado por la API central. Lleva la cámara, el sitio, un
identificador único y 60 segundos de vida.

- **Atado a una cámara.** Un ticket de `ING-CAM-01` no abre `ING-CAM-02`,
  diga lo que diga la ruta.
- **Un solo uso.** La primera oferta aceptable lo gasta, arranque o no la
  cámara. Reintentar exige otra sesión del backend, y por tanto otro registro
  de auditoría.
- **El algoritmo no se negocia.** Un token que anuncie `none` o uno asimétrico
  se rechaza antes de mirar la firma.
- **Rotación sin corte.** `CONSTRUIBLEC_LIVE_TICKET_KEYS` admite varias claves:
  firma la primera y verifican todas.

El conjunto de tickets usados vive en la memoria del proceso. Un reinicio lo
olvida, y como un ticket vive un minuto, eso es lo máximo que podría ganar una
repetición.

### El recurso de la sesión

`Location` devuelve `/v1/live/sessions/{token}`. Ese token es otra firma de la
API, que nombra una sesión del relay y caduca con ella. Sirve para enviar
candidatos ICE tardíos y para cerrar. Como viaja en la ruta, el access log de
uvicorn debe seguir apagado (`--no-access-log`); hay una prueba que lo fija.

### Códigos de error propios

| `code` | Estado | Dónde | Significa |
|---|---|---|---|
| `live_unavailable` | 503 | Ambos | Video sin configurar, o el relay o Cloudflare TURN no respondieron |
| `live_capacity_reached` | 503 | Ambos | Las 5 sesiones están en uso, o la cámara ya tiene 2 espectadores |
| `camera_unreachable` | 502 | WHEP | El gateway no entregó el video en 10 s |
| `device_ambiguous` | 500 | Sesión | Dos edificios declaran la misma cámara |
| `gateway_unreachable` | 503 | Sesión | No se pudo saber de quién es la cámara |
| `unauthorized` | 401, 403 | WHEP | Ticket no válido (401) u origen no permitido (403) |

## El relay

MediaMTX v1.21.1, como servicio aparte: `construiblec-live-relay.service`, con
`deploy/mediamtx.yml`. Lo instala `scripts/install-relay.sh`.

- **Sin secretos y sin edificios en su configuración.** El camino de cada
  cámara lo crea la API central por la API de control, en memoria, al llegar
  cada oferta. Si el relay reinicia, la siguiente oferta lo vuelve a crear.
- **Bajo demanda.** Sin espectadores no hay tráfico por Tailscale ni carga en
  el NVR. El origen se suelta 10 s después de irse el último.
- **Todo en loopback**, salvo el UDP 8189 por el que sale el video.
- **El filtro de red de la unidad** (`IPAddressDeny=any` más los rangos de
  Cloudflare y Tailscale) vale en los dos sentidos. Es lo que mantiene cerrado
  ese puerto para cualquiera que no sea el servicio TURN, aunque el
  cortafuegos lo dejara pasar.

MediaMTX arranca cada protocolo que no se apaga de forma explícita, y en todas
las interfaces. La v1.21 añadió MoQ, que con la configuración de ejemplo abre
los puertos 8892 y 8893 al mundo. Por eso `mediamtx.yml` apaga cada uno por su
nombre y `install-relay.sh` comprueba, tras arrancar, qué escucha de verdad.

### Límites

| Límite | Valor | Quién lo aplica |
|---|---|---|
| Vida del ticket | 60 s | API central |
| Duración de una sesión | 300 s, más hasta 15 s | API central: corta cada 15 s leyendo la lista del relay |
| Sesiones simultáneas | 5 en total | API central, al emitir y al negociar |
| Espectadores por cámara | 2 | Relay (`maxReaders`) |
| Arranque de la cámara | 10 s | Relay (`sourceOnDemandStartTimeout`) |
| Credencial TURN | 600 s | Cloudflare: la sesión más 5 minutos |

El límite total es una lectura seguida de una decisión, sin bloqueo: dos
ofertas simultáneas pueden pasar de 5 a 6. Con el uso esperado no merece más.

## Decisiones que cambian lo aprobado

Cuatro desviaciones de `approved-decisions-v1.md`. Se recogen aquí hasta que
pasen a ese documento.

1. **La VPS custodia secretos nuevos.** La clave que firma los tickets, el
   token de la API de Cloudflare TURN y una credencial de medios por gateway.
   Viven en el `EnvironmentFile`, como las credenciales de gateway, y se suman
   a la decisión pendiente sobre su custodia.
2. **Un hostname sin Access.** `live.construiblec.cloud` autentica con el
   ticket. Se acota con tres medidas: el túnel solo enruta `/v1/live/`, el
   origen debe estar en la lista, y sin ticket válido no se lee ni el cuerpo.
   Falta una regla de límite de peticiones en Cloudflare para ese hostname.
3. **Estado en la VPS**, acotado (§1.9). El relay es un proceso con sesiones
   vivas, y la API guarda en memoria los tickets usados durante un minuto. No
   hay base de datos ni nada que sobreviva a un reinicio.
4. **La política de Tailscale se amplía** con `tcp:8554` desde `tag:iot-vps`
   hacia los gateways, además del `tcp:18100` actual.

Lo que **no** cambia: la VPS sigue sin tocar la LAN, el gateway sigue sin
salida a internet, y el backend sigue siendo quien decide.

## Estado de la verificación

Probado el 2026-10-01, en local y solo en loopback, con MediaMTX v1.21.1:

- La cadena completa: cámara simulada (H.264, 640×360, 15 fps) → relay con el
  papel de gateway → relay de la VPS con `deploy/mediamtx.yml` → API central →
  cliente WebRTC. La oferta se responde en 0,2 s y el primer cuadro llega
  0,5 s después de enviarla.
- El ticket reutilizado se rechaza, la sesión se corta al cumplir su duración,
  el cierre libera el relay y una cámara sin señal responde
  `camera_unreachable` a los 10 s.
- La semántica de la API de control de MediaMTX que usa `app/media_relay.py`.
- Con esa configuración el relay escucha solo en loopback y en el UDP 8189.

**Sin verificar todavía**, porque exigen credenciales reales o tocar
producción:

| Pendiente | Por qué importa |
|---|---|
| Emitir credenciales con el token real de Cloudflare TURN | El cliente se escribió contra su documentación |
| Un navegador en modo `relay` contra el relay de la VPS | Es la única ruta del video. Depende de que el candidato del relay sea la IP pública de `eth0` y de que el cortafuegos deje volver las respuestas del TURN |
| La negociación a través del túnel | Hoy `live.construiblec.cloud` responde 404: el hostname existe pero no está enrutado al origen |
| La unidad `construiblec-live-relay.service` | No se ha instalado ni arrancado. `AF_NETLINK` y el filtro de red se eligieron por análisis |
| Un NVR real, Hikvision y Dahua | El perfil H.264, el intervalo de I-frame y la latencia real por Tailscale |
| La latencia de punta a punta | La medida local no incluye Tailscale ni TURN |

Si el navegador no conecta en modo `relay`, las dos salidas previstas son
abrir UDP 8189 solo a los rangos de Cloudflare en el cortafuegos, o dar también
al relay una credencial TURN (`webrtcICEServers2`).
