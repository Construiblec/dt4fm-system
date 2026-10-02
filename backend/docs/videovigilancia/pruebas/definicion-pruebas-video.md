# Definición de pruebas — Videovigilancia en vivo

**Versión:** 1.0 · **Fecha:** 2026-10-02

| Documento | Para qué |
|---|---|
| Este | Qué se prueba, con qué datos y qué resultado se exige |
| [Colección de Postman](../../accesos%20y%20huespedes/pruebas/postman/) | Carpeta **06 Videovigilancia** de la colección de dispositivos, con las mismas fichas de edificio |

---

## 1. Propósito

Comprobar, **sobre cámaras reales**, que el Supervisor CAV ve una cámara en vivo desde el panel y
que cada visualización queda registrada en el backend, sin que la sesión se filtre ni se quede
abierta.

## 2. Alcance

**Dentro.** Por edificio con cámaras, en tres grupos:

| Grupo | Qué cubre |
|---|---|
| VID | Catálogo, sesión, registro e historial |
| VIV | En el navegador: video, fin de sesión, cierre, cambio de cámara |
| VSG | Seguridad: roles, secretos, orígenes, cupos |

**Fuera.** Lo que la E2E ya cubre sin hardware: cada código de error de la VPS, el `requestId`
repetido, el interruptor apagado. Y lo que no existe: grabaciones, audio, PTZ.

**Bloqueo actual.** Los gateways aún no entregan video, `GET /v1/cameras` responde `[]` y
`live.construiblec.cloud` responde `404` porque el túnel no lo enruta todavía. Hasta entonces solo
se ejecutan VID-P1 y VID-01, que deben dar una lista vacía sin error.

## 3. Entorno

- Backend de staging con `ACCESS_IOT_USE_MOCK=false` y `LIVE_VIDEO_ENABLED=true`.
- Frontend abierto **desde un origen dado de alta** en IoT (V-10). Desde una *preview* de Vercel el
  video falla con `403` por diseño.
- Chrome de escritorio y un teléfono (Safari en iOS o Chrome en Android) para VIV-01.
- Las cuentas de la campaña de dispositivos: SuperUser, SupervisorCAV y un rol sin permiso.
- Acceso a la base de staging para leer `live_view_request`.

## 4. Criterios

**Entrada:** `/v1/health` muestra el gateway del edificio en línea y `GET /v1/cameras?buildingId=`
devuelve al menos una cámara.

**Salida:** todos los casos del edificio registrados como OK, FALLA o N/A, con su evidencia.

**Limpieza:** ninguna sesión abierta al terminar (VIV-03), y `LIVE_VIDEO_ENABLED` vuelve a su valor
anterior.

## 5. Catálogo de casos

### VID-P1 · La VPS lista las cámaras del edificio

| | |
|---|---|
| Acción | Postman: `VID-P1` (`GET /v1/cameras?buildingId=` con el service token) |
| Esperado | `200` con una lista; vacía es correcto mientras los gateways no entreguen video |

### VID-01 · El panel muestra las mismas cámaras

| | |
|---|---|
| Acción | Postman: `VID-01`; en la app, pestaña **Cámaras** |
| Esperado | `enabled: true`; las cámaras de VID-P1 bajo su edificio, con su nombre |

### VID-02 · Pedir una sesión la registra antes de entregarla

| | |
|---|---|
| Acción | Postman: `VID-02` |
| Esperado | `201`, `Cache-Control: no-store`, `iceTransportPolicy: "relay"`, eco del `requestId` |
| Base | Una fila `issued` con ese `requestId`, la cámara, el edificio y el usuario CAV |
| Después | Postman: `VID-02b` repite el `requestId` → `409 duplicate_request`, sin fila nueva |

### VID-03 · El historial la muestra al SuperUser

| | |
|---|---|
| Acción | Postman: `VID-03` |
| Esperado | La fila de VID-02 con `status: issued`; sin `ticket` en la respuesta |

### VIV-01 · El operador ve la cámara

| | |
|---|---|
| Acción | App → Cámaras → edificio → **Ver** |
| Esperado | «Conectando…» y luego imagen en menos de 15 s, con «En vivo» y la cuenta atrás. En el teléfono, sin pantalla completa forzada |
| Evidencia | Captura; `chrome://webrtc-internals` muestra solo candidatos `relay` |

### VIV-02 · La sesión termina a los 300 s y no reconecta sola

| | |
|---|---|
| Acción | Dejar la cámara abierta 5 minutos |
| Esperado | «Sesión finalizada» con **Continuar**. Sin clic, ninguna fila nueva en la base. **Continuar** abre otra sesión y otra fila |

### VIV-03 · Cerrar libera el cupo

| | |
|---|---|
| Acción | Con una cámara en vivo: cambiar a otra, cambiar de edificio, pulsar ✕ y cerrar la pestaña |
| Esperado | Cada vez sale un `DELETE` a `live.construiblec.cloud` (pestaña Red de DevTools) y la imagen anterior se detiene |

### VIV-04 · Una cámara sin señal se informa

| | |
|---|---|
| Acción | Con IoT, desconectar la cámara o pedir una que el grabador no entregue |
| Esperado | «Cámara sin señal» con **Reintentar**; la fila queda `issued` y el log de la VPS muestra `camera_unreachable` con el mismo `requestId` |

### VSG-01 · Sin rol no hay sesión

| | |
|---|---|
| Acción | Postman: `VSG-01` |
| Esperado | `403`; ninguna fila nueva |

### VSG-02 · Los secretos no se guardan

| | |
|---|---|
| Acción | Tras VID-02, buscar el ticket en la base y en los logs del backend |
| Esperado | `live_view_request` no tiene columna para él; el log de Render no contiene `ticket` ni `credential` |

### VSG-03 · Un origen no dado de alta recibe `403`

| | |
|---|---|
| Acción | Abrir el panel desde una *preview* de Vercel o un túnel `*.trycloudflare.com` y pulsar **Ver** |
| Esperado | «Este sitio no está autorizado para ver video. Avisa a Sistemas.» sin botón de reintento |

### VSG-04 · Los cupos se respetan

| | |
|---|---|
| Acción | Abrir la misma cámara en tres navegadores |
| Esperado | El tercero ve «Hay demasiadas cámaras abiertas o esta ya tiene dos espectadores» |

## 6. Trazabilidad

| Decisión | Casos |
|---|---|
| V-01 · Quién ve qué | VID-01, VSG-01 |
| V-02 · Sin registro no hay video | VID-02, VID-03 |
| V-03 · La sesión no se guarda | VID-02, VSG-02 |
| V-04 · Sin reintentos ni reconexión | VIV-02, VIV-04 |
| V-06 · El catálogo no se borra | VID-01 |
| V-07 · Una cámara a la vez | VIV-03, VSG-04 |
| V-10 · Orígenes dados de alta | VSG-03 |

## 7. Registro de resultados

**Evidencia:** hora, `requestId`, `X-Request-ID` si hubo error, captura.

### Resultados — Inglaterra

**Fecha:** · **Operador:**

| ID | Estado | Evidencia |
|---|---|---|
| VID-P1 | | |
| VID-01 | | |
| VID-02 | | |
| VID-03 | | |
| VIV-01 | | |
| VIV-02 | | |
| VIV-03 | | |
| VIV-04 | | |
| VSG-01 | | |
| VSG-02 | | |
| VSG-03 | | |
| VSG-04 | | |
