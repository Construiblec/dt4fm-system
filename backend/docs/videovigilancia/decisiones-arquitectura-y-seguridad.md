# Decisiones de arquitectura y seguridad — videovigilancia en vivo

Por qué el módulo está construido como está. **Cerradas: no se vuelven a decidir.** El *cómo* está
en el [README](README.md); el contrato de IoT, en
[live-integration-dt4fm.md](live-integration-dt4fm.md).

V-01, V-09 y V-10 las confirmó el negocio el 2026-10-02. El resto salen del contrato de IoT o de las
decisiones de control de accesos ([D-01 a D-18](../accesos%20y%20huespedes/decisiones-arquitectura-y-seguridad.md)).

| # | Decisión | A quién le toca |
|---|---|---|
| [V-01](#v-01--quién-ve-qué) | Quién ve qué | Backend |
| [V-02](#v-02--sin-registro-no-hay-video) | Sin registro no hay video | Backend |
| [V-03](#v-03--la-sesión-no-se-guarda) | La sesión no se guarda | Backend + frontend |
| [V-04](#v-04--un-requestid-por-clic-sin-reintentos) | Un `requestId` por clic, sin reintentos | Backend + frontend |
| [V-05](#v-05--una-vps-un-cliente) | Una VPS, un cliente | Backend |
| [V-06](#v-06--el-catálogo-no-se-borra-por-una-respuesta-corta) | El catálogo no se borra por una respuesta corta | Backend |
| [V-07](#v-07--una-cámara-a-la-vez) | Una cámara a la vez | Frontend |
| [V-08](#v-08--interruptor-apagado-por-defecto) | Interruptor apagado por defecto | Backend |
| [V-09](#v-09--historial-solo-para-superuser) | Historial solo para SuperUser | Backend |
| [V-10](#v-10--orígenes-dados-de-alta) | Orígenes dados de alta | IoT |

---

## V-01 · Quién ve qué

**SupervisorCAV y SuperUser ven todas las cámaras de todos los edificios.** Ningún otro rol.

**Por qué.** Es el mismo criterio que D-18 para la barrera: el Supervisor CAV opera cualquier
edificio. No existe asignación de usuarios a edificios, ni en openMAINT ni en el backend, y crearla
solo para el video sería un modelo nuevo que mantener.

**Consecuencia.** La comprobación es de rol, con `requireIdentity` de
[cav-session.ts](../../src/modules/access-control/cav-session.ts), contra la sesión de openMAINT.
Restringir por edificio más adelante exige ese modelo de asignación primero.

## V-02 · Sin registro no hay video

La fila de `live_view_request` se escribe como `requested` **antes** de pedir la sesión a la VPS.
Si al volver no se puede marcar `issued`, la sesión **no se entrega**: el backend responde `503` y
el ticket caduca solo a los 60 s.

**Por qué.** La VPS no guarda quién vio qué. Si el backend entregara una sesión sin dejar la fila,
esa visualización no constaría en ningún sitio. Si el proceso muere entre la VPS y la base, queda la
fila `requested`: rastro de que se pidió.

## V-03 · La sesión no se guarda

El `ticket` y la `credential` del TURN no van a la base, ni a los logs, ni a ninguna caché.

- La tabla no tiene columnas para ellos.
- El cliente nunca registra el cuerpo de éxito; los logs llevan cámara, usuario y `requestId`.
- La respuesta sale con `Cache-Control: no-store`.
- El frontend la guarda solo en memoria, el tiempo de negociar.

**Por qué.** Lo exige el contrato de IoT: son secretos de corta vida. Con el ticket, cualquiera
negocia esa cámara durante 60 s.

## V-04 · Un `requestId` por clic, sin reintentos

Cada clic del operador, incluidos «Continuar» y «Reintentar», genera un UUID nuevo. Repetir uno es
`409 duplicate_request`. El backend no reintenta `live-sessions` y el frontend no reconecta solo.

**Por qué.** Cada sesión es una visualización registrada: un reintento automático serían filas que
nadie pidió. Y un ticket vale para una sola oferta, así que reintentar exige otra sesión de todas
formas.

**Consecuencia.** Es lo contrario que en las puertas, donde el `requestId` se **reutiliza** para que
repetir la petición no repita el pulso (D-18). Aquí no hay nada físico que proteger de un doble
efecto, y sí un registro que mantener limpio.

## V-05 · Una VPS, un cliente

`listCameras` y `createLiveSession` viven en `AccessIotGateway`, el mismo cliente de accesos, y el
módulo de accesos lo exporta.

**Por qué.** Es la misma VPS, con la misma URL y el mismo service token (D-09). Un segundo cliente
duplicaría la autenticación, el `maxRedirects: 0` ante el `302` de Cloudflare, el mock y la
sustitución en las E2E.

## V-06 · El catálogo no se borra por una respuesta corta

Las cámaras conocidas se guardan en memoria. Un edificio cuyo gateway no responde no aporta cámaras
a `GET /v1/cameras`; sus cámaras se siguen mostrando como «sin conexión». Solo un `404 not_found` al
pedir sesión retira una cámara.

**Por qué.** Lo pide el contrato de IoT: una lista corta no significa que las cámaras ya no existan.

**Consecuencia.** En memoria y no en la base: tras un reinicio, el catálogo se rehace con la primera
consulta. Un edificio caído justo entonces no aparece hasta que vuelva. Se aceptó por simplicidad;
ninguna decisión depende de ese catálogo.

## V-07 · Una cámara a la vez

Un único visor. Abrir otra cámara, cambiar de edificio, cerrar el visor o salir de la página cierra
la sesión y manda el `DELETE`. La sesión se pide al pulsar, nunca al cargar.

**Por qué.** La VPS tiene 5 sesiones para todos los edificios y 2 espectadores por cámara. Una
cuadrícula o una sesión olvidada dejarían sin video al resto de operadores. Y el ticket caduca a los
60 s: pedirlo por adelantado lo gastaría.

## V-08 · Interruptor apagado por defecto

`LIVE_VIDEO_ENABLED=false` hasta que IoT despliegue y los gateways entreguen video. Apagado, el
catálogo se ve con un aviso y pedir sesión es `503 live_disabled`.

**Por qué.** Igual que `ACCESS_REMOTE_OPEN_ENABLED`: el código puede llegar a producción antes que
el servicio.

## V-09 · Historial solo para SuperUser

`GET /cameras/views` devuelve las visualizaciones con filtros por cámara, usuario, edificio y fechas.
Solo SuperUser. No hay pantalla todavía.

**Por qué.** Quién vigila a quién: el Supervisor CAV no debe auditarse a sí mismo. La pantalla se
hará cuando alguien la pida; el dato ya está.

## V-10 · Orígenes dados de alta

`live.construiblec.cloud` solo acepta ofertas de los orígenes que IoT tiene en su lista. Se pidieron
tres, en la [nota de orígenes](nota-origenes-video.md):

- `http://localhost:5173`
- `https://dt4fm-staging.vercel.app`
- `https://dt4fm-system-f7cc.vercel.app`

**Fuera, a propósito:** `https://construiblec.cloud`, `https://www.construiblec.cloud` y
`http://187.77.250.224:8091`. El CORS de producción del backend los acepta para el resto de la
aplicación, pero las cámaras no se ven desde ellos. Decidido el 2026-10-02.

**Consecuencia.** Desde esas direcciones, y desde las *previews* de Vercel y los túneles
`*.trycloudflare.com`, la pantalla carga el catálogo pero **Ver** termina en «Este sitio no está
autorizado para ver video». Un dominio nuevo es una petición a IoT antes del despliegue.

**Comprobado el 2026-10-02** con un preflight a `/v1/live/ING-CAM-01/whep`: `204` para los tres
orígenes y `403` para `https://construiblec.cloud`.
