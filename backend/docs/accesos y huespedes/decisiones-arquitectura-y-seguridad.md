# Decisiones de arquitectura y seguridad — control de accesos

Por qué el módulo está construido como está. **Cerradas: no se vuelven a decidir.** El *cómo* está
en el [README](README.md); lo que le toca a Ingeniería IoT, en la
[guía de la VPS](guia-servidor-vps-accesos.md).

D-01 y D-02 las fijó el negocio. El resto se derivan de ellas.

| # | Decisión | A quién le toca |
|---|---|---|
| [D-01](#d-01--el-backend-lleva-el-ciclo-de-vida) | El backend lleva el ciclo de vida | Backend |
| [D-02](#d-02--el-portal-del-huésped-es-de-dt4fm) | El portal del huésped es de DT4FM | Backend |
| [D-03](#d-03--la-vps-no-guarda-pines-ni-intención) | La VPS no guarda PINes ni intención | IoT |
| [D-04](#d-04--la-conciliación-la-hace-el-backend) | La conciliación la hace el backend | Ambos |
| [D-05](#d-05--el-tramo-vps--gateway-es-síncrono) | El tramo VPS ↔ gateway es síncrono | IoT |
| [D-06](#d-06--identidad-y-espacio-de-nombres) | Identidad y espacio de nombres | Ambos |
| [D-07](#d-07--utc-por-dentro-offset-en-el-cable) | UTC dentro, offset en el cable | Ambos |
| [D-08](#d-08--errores-tipados-y-regeneración-por-conflicto) | Errores tipados y conflicto de PIN | Ambos |
| [D-09](#d-09--autenticación-distinta-en-cada-tramo) | Autenticación distinta por tramo | Ambos |
| [D-10](#d-10--el-pin-en-tránsito-nunca-en-reposo) | El PIN en tránsito, nunca en reposo | Ambos |
| [D-11](#d-11--mitigaciones-del-pin-de-cuatro-dígitos) | Mitigaciones del PIN de 4 dígitos | IoT |
| [D-12](#d-12--la-consola-local-se-queda) | Consola local como *break-glass* | IoT |
| [D-13](#d-13--auditoría-de-aperturas) | Auditoría de aperturas | IoT → backend |
| [D-14](#d-14--purga-y-capacidad) | Purga y capacidad | Ambos |
| [D-15](#d-15--el-inventario-se-pagina-siempre) | El inventario se pagina siempre | IoT |
| [D-16](#d-16--un-repositorio-despliegue-parametrizado) | Un repositorio, no uno por edificio | IoT |
| [D-17](#d-17--servicio-persistente-y-latido) | Servicio persistente y latido | IoT |

---

## D-01 · El backend lleva el ciclo de vida

`access_credential` es la única autoridad sobre qué PIN existe, para quién, con qué vigencia y en qué
estado.

**Por qué.** Todos los hechos que gobiernan una credencial —reserva de Hostaway, cancelación, cambio
de fechas— llegan al backend y a ningún otro sitio.

## D-02 · El portal del huésped es de DT4FM

Se implementa en el backend, sobre `guest_stay`, con enlace firmado y canje con segundo factor.

**Por qué.** El portal se alimenta de la reserva. Construirlo del lado IoT obligaría a replicar
Hostaway allí y a que el PIN saliera por un segundo camino.

**Consecuencia.** El hostname de huéspedes que preveía el plan de IoT no se crea.

## D-03 · La VPS no guarda PINes ni intención

Recibe el PIN en el `PUT`, lo escribe y **lo descarta**. Su modelo se reduce a `gateways`, `devices`,
`placements` y `events`.

**Por qué.** Si la intención vive arriba, replicarla abajo crea dos verdades y ninguna forma de saber
cuál gana. Y guardar el PIN convierte un volcado de la VPS en la llave de todos los edificios — hoy
`users.pin` está en claro en SQLite, con un índice encima.

**Consecuencia.** El inventario que se lee por ISAPI **también** trae PINes (`UserInfo/Search`
devuelve `password`): hay que descartarlos en memoria. Es una regla de código, no de configuración, y
merece una prueba que la fije.

## D-04 · La conciliación la hace el backend

Se invierte el sentido: el gateway **informa** lo que hay en el terminal, el backend compara contra
`access_credential` y decide. El aparato deja de ser fuente de verdad.

**Por qué.** Quien compara tiene que conocer la intención, y la intención está en Postgres (D-01).
Además así la corrección es un `PUT` idempotente normal, sin camino de escritura especial ni
necesidad de que la VPS conserve el PIN.

**La regla que protege a la gente:** lo que no lleva prefijo `DT4-` se reporta y **no se toca**. Un
barrido que borre lo desconocido deja a residentes fuera de su casa.

## D-05 · El tramo VPS ↔ gateway es síncrono

La VPS alcanza al gateway por un túnel persistente y relaya el `PUT` en el momento. **El gateway no
sondea.**

**Por qué.** Es lo que sostiene D-10: si el gateway pregunta, la VPS tiene que retener la escritura
hasta que llegue, y el PIN acaba en su disco. Además el resultado real llega en la respuesta, sin
callbacks ni estados intermedios.

**Si el sondeo resultara inevitable**, hay que asumir por escrito: PIN cifrado en reposo con clave
fuera de la base, borrado en cuanto el gateway confirma, TTL corto, y `queued` más un callback al
backend. Es peor.

## D-06 · Identidad y espacio de nombres

El `credentialId` lo propone el backend (uuid) y viaja en la URL. El `employeeNo` se **deriva** de él
con prefijo reservado: `DT4-G-` huésped, `DT4-T-` residente, `DT4-E-` personal. **Nunca se reutiliza**
un `employeeNo`, y **nunca se borra** un usuario sin ese prefijo.

**Por qué.** Tres cosas a la vez: hace la escritura idempotente, la revocación precisa, y separa lo
que creó el sistema de lo que cargó una persona.

**Qué corrige.** `next_available_employee_no()` devuelve el entero libre más bajo y el borrado elimina
la fila, así que el número de un huésped que se fue **se reasigna al siguiente**, y cualquier evento
histórico quedaría atribuido a la persona equivocada.

## D-07 · UTC por dentro, offset en el cable

En reposo, UTC (`timestamptz`). En el cable, ISO 8601 con offset explícito. La conversión a hora local
del equipo ocurre en **un único punto**: el gateway, antes de serializar el `UserInfo`.

**Por qué.** `require_local_datetime()` hoy **rechaza** cualquier marca con `tzinfo`. Una marca
ingenua no significa nada fuera del proceso que la escribió: basta un contenedor con otro `TZ` para
desplazar todas las vigencias sin un solo error visible.

**Nota justa.** Quito es UTC−5 todo el año. El riesgo real hoy es menor que en el caso general; eso no
lo hace correcto, y el arreglo es barato ahora y caro después.

## D-08 · Errores tipados, y regeneración por conflicto

Toda respuesta de error lleva un `code` estable: `gateway_unreachable`, `device_unreachable`,
`pin_conflict`, `device_full`, `unauthorized`, `invalid_request`. Tabla completa en la
[guía §5](guia-servidor-vps-accesos.md#5-errores-tipados-no-texto).

**Por qué `pin_conflict` tiene código propio.** El índice único de Postgres garantiza unicidad entre
lo que el backend emite, **no frente a los residentes cargados a mano** que comparten el espacio de
10.000 combinaciones. La única salida es regenerar y reemitir.

**Por qué no un endpoint de «¿está libre este PIN?».** Sería un oráculo de enumeración. Dejar fallar
la escritura es autocorrector y no filtra nada.

## D-09 · Autenticación distinta en cada tramo

Tres tramos, tres mecanismos, ningún secreto compartido entre ellos: Cloudflare Access con service
token del backend a la VPS; credencial propia por gateway de la VPS al gateway; Digest ISAPI con
usuario distinto por dispositivo del gateway al terminal.

**Por qué el service token y no una allowlist de IP.** Render no garantiza IP de salida.

**Por qué credencial por gateway y no un token de flota.** Con un secreto único, un edificio
comprometido entrega todos y no hay forma de revocar uno solo.

## D-10 · El PIN en tránsito, nunca en reposo

Existe cifrado en un único lugar del mundo: `access_credential.pin_ciphertext`, AES-256-GCM con clave
fuera de `DATABASE_URL`. Fuera de ahí solo aparece en el cuerpo del `PUT`, en el cuerpo ISAPI dentro
de la LAN, y en la respuesta del portal a su dueño.

**Prohibido** en las tres capas: persistirlo en VPS o gateway, registrarlo en logs, devolverlo en
respuestas de operación (los listados exponen `pinConfigured` booleano), y enviarlo por correo o por
mensaje de Hostaway — solo viaja el enlace al portal.

**Por qué cifrado y no hasheado.** El portal tiene que mostrárselo al huésped cada vez que abra el
panel, no solo al emitirlo. Se compensa con clave separada, cifrado autenticado y `decrypt()` en un
único punto del código.

## D-11 · Mitigaciones del PIN de cuatro dígitos

Cuatro dígitos son 10.000 combinaciones, y las puertas están en modo PIN solo. Tres controles dejan de
ser opcionales: **bloqueo por intentos fallidos en el terminal** (en el hardware, no en el software),
**rechazo de PINes débiles** en el generador, y **alerta por ráfaga de `access_denied`**.

**El enfriamiento aguanta.** Un edificio de 40 unidades con rotación de cuatro días emite unos 300
PINes al mes, un 3 % del espacio. El riesgo del PIN corto es la fuerza bruta, no el agotamiento.

## D-12 · La consola local se queda

El frontend del gateway y sus rutas `/api/` no se retiran: son la salida de emergencia cuando el
backend o el túnel no estén disponibles. Lo creado a mano no lleva prefijo `DT4-`, escrituras y
control físico siguen apagados por defecto, y cada uso queda en el historial.

**Por qué.** Una puerta que no abre a las once de la noche no espera a que Render despierte. Un camino
manual documentado es parte del diseño, y ya está construido y endurecido.

## D-13 · Auditoría de aperturas

No existe hoy en ningún sitio: nada lee `AcsEvent`. Se construye en tres pasos — el gateway lee y
bufferiza, la VPS consolida y expone `GET /v1/events`, el backend consulta bajo demanda. Cuando vuelva
`access_event` se añade el empuje idempotente por `eventId`.

**Por qué en ese orden.** Empujar solo tiene sentido si hay dónde guardar; un webhook que recibe
eventos para descartarlos es infraestructura sin destinatario. Pero **la fuente hay que construirla
ya**, porque de ella depende la alerta de fuerza bruta de D-11.

## D-14 · Purga y capacidad

Un barrido diario emite el `DELETE` de las credenciales `expired` y `revoked` que sigan escritas. Al
confirmar, el PIN entra en enfriamiento.

**Por qué no basta con dejar vencer.** El terminal ignora una credencial fuera de vigencia, pero el
registro **sigue ocupando sitio**. Los huéspedes rotan, y en unos meses el equipo alcanza su tope y
**rechaza altas nuevas**. No es higiene opcional, es requisito funcional.

## D-15 · El inventario se pagina siempre

Toda lectura de usuarios recorre `searchResultPosition` hasta agotar el listado. Ninguna operación usa
un tope fijo.

**Qué corrige.** `get_users(max_results=50)` con posición fija en `0`, seguido de
`DELETE FROM device_users WHERE device_id = ?`: en un terminal con más de 50 usuarios, **cada
sincronización borra del espejo a todos los demás**, sin que nada falle.

**Es prerrequisito de D-04**, no una mejora paralela: con paginación parcial, la conciliación
reescribiría credenciales legítimas por creerlas ausentes.

## D-16 · Un repositorio, despliegue parametrizado

Un único código de gateway desplegado N veces con su `config/buildings.json` y sus variables.

**Por qué.** Cuatro edificios serían cuatro copias divergiendo, con la corrección de un fallo aplicada
cuatro veces y olvidada en alguna. La separación por edificio es un dato, no una rama.

## D-17 · Servicio persistente y latido

El gateway corre como servicio `systemd` con `Restart=on-failure`, usuario dedicado sin login. La VPS
registra `lastSeenAt` por gateway y **alerta cuando se enfría**.

**Por qué.** Un reinicio de la Raspberry el 03-09-2026 terminó el proceso y no había systemd: el
servicio dejó de existir. Y un gateway caído **no produce errores visibles** — las puertas siguen
abriendo con lo ya sincronizado, pero altas y revocaciones dejan de aplicarse en silencio. Ese es el
fallo peligroso del módulo.

**Consecuencia.** `GET /v1/health` distingue `gatewayOnline` (túnel) de `online` por dispositivo
(LAN): son incidentes distintos con responsables distintos.

---

## Pendiente de acordar

Nada bloquea el desarrollo; es acuerdo operativo, no diseño.

- Retención de eventos en la VPS y hasta qué fecha se puede consultar hacia atrás.
- Latencia máxima comprometida entre el `PUT` y el PIN funcionando en la puerta — decide si el portal
  dice «tu PIN» o «tu PIN se está activando».
- Plazo de anonimización de los datos personales de `guest_stay` tras el check-out.
- Ventana y responsable de la migración de la base de Inglaterra y Pradera.
- Confirmar `ACCESS_CHECKIN_HOUR` / `ACCESS_CHECKOUT_HOUR` contra la configuración real de los
  listings de Hostaway, y si Inglaterra y Pradera difieren. Hoy el backend tiene **un solo par
  global**, no uno por edificio.
