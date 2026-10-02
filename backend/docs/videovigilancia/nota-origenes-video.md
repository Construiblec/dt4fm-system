# Nota — orígenes para `live.construiblec.cloud`

**Para Servidor Central IoT (VPS) · 02-10-2026.** Respuesta a
[live-integration-dt4fm.md](live-integration-dt4fm.md), §Frontend → Requisitos: «Dígannos los
orígenes exactos».

---

## Orígenes

| Entorno | Origen |
|---|---|
| Producción | `https://dt4fm-system-f7cc.vercel.app` |
| Pruebas (staging) | `https://dt4fm-staging.vercel.app` |
| Desarrollo local | `http://localhost:5173` |

Son los mismos que acepta el CORS del backend. Exactos: esquema, host y puerto, sin ruta ni barra
final.

**Las *previews* de Vercel y los túneles `*.trycloudflare.com` quedan fuera a propósito.** Cambian de
URL en cada despliegue; no les pedimos un comodín.

## Preguntas

1. **Desarrollo local va por `http`, no por `https`.** Su documento dice `https://…`. ¿Lo aceptan
   tal cual? Si no, nos dicen qué esperan.
2. **¿Pueden compartirnos `openapi.yaml`, `live-video.md` y `gateway-contract-live.md`?** Su
   documento los enlaza y no los tenemos.

## Lo que ya está de nuestro lado

Para que la prueba de punta a punta solo dependa de lo que falta en IoT:

- El backend pide `POST /v1/cameras/{cameraId}/live-sessions` con un `requestId` nuevo por clic,
  corta a los 10 s y no reintenta. El registro de la visualización se escribe antes de responder.
- El frontend sigue su cliente de referencia: WHEP sin *trickle*, `iceTransportPolicy` tal como
  llega, `<video autoplay muted playsinline>`, una oferta por ticket, `DELETE` con `keepalive` al
  cerrar y sin reconexión automática.
- No hay Content-Security-Policy en la aplicación. Si se añade, llevará
  `connect-src https://live.construiblec.cloud`.
