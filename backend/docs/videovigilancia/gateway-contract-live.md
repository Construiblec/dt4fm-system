# Contrato VPS → gateway: video en vivo

> Propuesta de Sistemas para el encargado de IoT. Complementa
> [`gateway-contract-operations.md`](gateway-contract-operations.md) y hereda
> sus reglas comunes: rutas bajo `/v1`, Bearer del sitio, `X-Request-ID`,
> errores `{"code", "message"}`.
>
> **No autoriza conectar nada a un NVR.** La primera prueba con un grabador
> real sigue el protocolo del final de este documento.

Define lo que la API central espera del gateway para que un operador de DT4FM
vea una cámara en vivo. El diseño completo está en [`live-video.md`](live-video.md).

`tools/fake_gateway.py` implementa la parte HTTP de este contrato y sirve de
referencia viva. La API central ya está implementada y probada contra él.

## Qué se le pide al gateway

Dos cosas, y solo dos:

1. **Decir qué cámaras tiene**, por HTTP, desde su registro.
2. **Re-servir el sub-stream de cada una por RTSP**, en su interfaz de
   Tailscale, cuando la VPS lo pide.

El gateway **sigue sin salida a internet**. La VPS **sigue sin tocar la LAN**:
nunca habla con el NVR, ni conoce su dirección, su marca o su usuario.

```text
VPS ──HTTP  tcp:18100──▶ gateway        GET /v1/cameras
VPS ──RTSP  tcp:8554 ──▶ gateway ──RTSP en la LAN──▶ NVR
```

## 1. `GET /v1/cameras`

Con el Bearer del sitio. Responde **desde el registro del gateway, sin tocar el
NVR**: la API central lo llama con 2 segundos de plazo cada vez que alguien
pide ver una cámara, para saber de qué edificio es.

```json
{
  "site_id": "inglaterra",
  "cameras": [
    {"cameraId": "ING-CAM-01", "name": "Acceso vehicular"},
    {"cameraId": "ING-CAM-02", "name": "Lobby"}
  ]
}
```

| Campo | Regla |
|---|---|
| `site_id` | El del gateway. Si no coincide con el registro de la VPS, la lista entera se descarta |
| `cameraId` | `^[A-Z0-9][A-Z0-9-]{0,63}$`, el mismo alfabeto que `deviceId`. Estable: el backend lo guarda. **Único entre todos los edificios**: si dos sitios declaran el mismo, la API central no emite sesión para ninguno |
| `name` | Etiqueta para el operador, de 1 a 128 caracteres |

- **Nada más.** La API central reconstruye cada entrada con esos dos campos y
  descarta el resto, pero el gateway no debe publicar la marca, el canal, la
  dirección del NVR ni ninguna URL.
- Un `cameraId` repetido o mal formado invalida **toda** la lista de ese sitio.
- Un sitio sin cámaras responde `200` con la lista vacía. Un gateway que
  todavía no implementa esta ruta responde `404`, y la API central lo lee igual:
  sin cámaras, no caído.
- No hay `GET /v1/cameras/{cameraId}`: la API central busca en la lista, como
  ya hace con `/v1/devices`.

## 2. El relay RTSP

`rtsp://<ip-tailscale-del-gateway>:8554/cam/{cameraId}`

| Requisito | Detalle |
|---|---|
| **Dónde escucha** | Solo en la interfaz de Tailscale, puerto `8554/tcp`. Nunca en la LAN ni en todas las interfaces |
| **Transporte** | RTSP sobre TCP (intercalado). Sin UDP: iría dentro de un túnel |
| **Autenticación** | Usuario `central` y la **credencial de medios** del sitio como contraseña. Sin ella, `401` |
| **Ruta** | `/cam/{cameraId}`, con el `cameraId` del registro. Cualquier otra, `404` |
| **Contenido** | Una pista de video H.264. Sin audio |
| **Bajo demanda** | El gateway pide el stream al NVR cuando la VPS conecta y lo suelta como mucho 10 s después de que se vaya |
| **Arranque** | El primer cuadro debe salir en menos de 10 s. Pasado ese plazo la VPS responde `camera_unreachable` |
| **Solo lectura** | La VPS nunca publica. El relay no acepta `ANNOUNCE` ni `RECORD` de ella |

### La credencial de medios

Una por sitio, **distinta del Bearer**. La que abre el video no debe poder
escribir un PIN ni pulsar una barrera, y al revés.

- Mismo formato que la otra: `v1.<43 caracteres base64url>`, generada con
  `scripts/generate_credential.py`.
- La VPS la presenta en claro, dentro de Tailscale. En la VPS vive en
  `GATEWAY_MEDIA_CREDENTIAL_<SITIO>`.
- Rotación: la VPS la relee en cada sesión, así que basta cambiarla en los dos
  lados. La sesión que esté en curso termina con su conexión.

### La credencial del NVR

Se queda en el gateway, por variable de entorno, como las de los terminales.
Hoy los NVR solo tienen el usuario administrador: **queda como deuda crear en
cada grabador un usuario de solo visualización** y usar ese. Con el admin, el
proceso que lee video podría también borrar grabaciones o cambiar la
configuración.

### Orígenes por marca

Lo que el gateway pide al NVR, por canal y siempre el **sub-stream**:

| Sitio | Marca | URL de origen |
|---|---|---|
| Inglaterra | Hikvision | `rtsp://<nvr>:554/Streaming/Channels/<canal>02` |
| Pradera | Dahua | `rtsp://<nvr>:554/cam/realmonitor?channel=<canal>&subtype=1` |

El canal 3 de Hikvision es `302`; el de Dahua, `channel=3&subtype=1`.

### Ajustes del sub-stream en el NVR

El gateway es una Raspberry y no transcodifica: lo que salga del NVR es lo que
ve el navegador. Por cámara:

| Ajuste | Valor | Por qué |
|---|---|---|
| Códec | H.264 | Los navegadores no reproducen H.265 por WebRTC |
| H.264+ / Smart Codec | Apagado | Alarga el intervalo entre I-frames y el video tarda en arrancar |
| Perfil | Baseline o Main, sin B-frames | WebRTC no reordena cuadros |
| Intervalo de I-frame | 1 a 2 s (15 a 30 cuadros a 15 fps) | Es lo que tarda en verse la imagen al conectar |
| Resolución | Hasta 1280×720 | El sub-stream suele ser 640×360 o 704×480, y basta |
| Cuadros | 12 a 15 fps | |
| Bitrate | 512 a 1024 kbps | Es lo que sube por el enlace del edificio, por espectador |
| Audio | Apagado | El NVR suele dar AAC, que WebRTC no admite |

## Red

- **Política de Tailscale**: añadir `tcp:8554` desde `tag:iot-vps` hacia los
  gateways. Hoy solo permite `tcp:18100`.
- Nada más cambia. El gateway no necesita ninguna salida nueva.
- Conviene que el enlace entre la VPS y el gateway sea directo
  (`tailscale ping` sin `via DERP`): por un relé DERP el video funciona, con
  más latencia.

## Implementación de referencia

No es parte del contrato: cualquier relay que cumpla la tabla sirve. La VPS usa
MediaMTX, que publica binarios para `arm64`, `armv7` y `armv6`, pide el origen
bajo demanda y no transcodifica.

```yaml
# mediamtx.yml en el gateway. Las direcciones y contraseñas son de ejemplo.
rtsp: true
rtspAddress: 100.64.0.1:8554        # la IP de Tailscale del gateway
rtspTransports: [tcp]
api: false
webrtc: false
rtmp: false
hls: false
srt: false
moq: false
metrics: false
pprof: false
playback: false

authInternalUsers:
  - user: central
    pass: <credencial de medios del sitio>
    ips: ["100.64.0.0/10"]
    permissions:
      - action: read

pathDefaults:
  sourceOnDemand: true
  sourceOnDemandStartTimeout: 10s
  sourceOnDemandCloseAfter: 10s
  rtspTransport: tcp
  record: false

paths:
  cam/ING-CAM-01:
    source: rtsp://<usuario>:<clave>@192.168.1.64:554/Streaming/Channels/102
  cam/ING-CAM-02:
    source: rtsp://<usuario>:<clave>@192.168.1.64:554/Streaming/Channels/202
```

**MediaMTX arranca cada protocolo que no se apaga, y en todas las
interfaces.** Con la configuración de ejemplo que trae abre RTSP, RTMP, HLS,
WebRTC, SRT y MoQ. Cada uno debe aparecer con su `false`, y conviene comprobar
con `ss -ltnup` qué escucha de verdad después de arrancar.

De esta referencia, la VPS ha probado en local la parte del servidor RTSP: solo
TCP, usuario `central`, lectura bajo demanda desde el relay de la VPS. **La
lectura desde un NVR real no se ha probado.**

## Límites que aplica la VPS

Para dimensionar: lo máximo que el gateway verá.

| Límite | Valor |
|---|---|
| Lectores RTSP por cámara | 1. El relay de la VPS abre una sola conexión por cámara, la compartan uno o dos espectadores |
| Cámaras a la vez, entre todos los edificios | 5 |
| Duración de una visualización | 300 s. Después la conexión RTSP se cierra en 10 s si nadie más mira |

## Primera prueba con un NVR real

Sin escritura de por medio el riesgo es menor que con las puertas, pero el NVR
es el que graba, y un proceso que lo sature afecta a la grabación.

1. Una sola cámara, la de menor interés, en un solo edificio.
2. Con el sub-stream ya ajustado según la tabla.
3. Comprobar en el NVR que la conexión aparece al pedir el video y desaparece
   10 s después de cerrarlo.
4. Comprobar que la grabación del canal no se interrumpe durante la prueba.
5. Solo entonces, el resto de cámaras del registro.
