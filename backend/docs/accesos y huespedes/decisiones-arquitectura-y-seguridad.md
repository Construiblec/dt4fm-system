# Decisiones de arquitectura y seguridad — control de accesos

**DT4FM – Digital Twin for Facility Management**

Registro de decisiones para el módulo de accesos repartido entre el backend DT4FM, la VPS central
de Ingeniería IoT y los gateways por edificio. Cada entrada fija **qué se hace, por qué, qué
consecuencias tiene y a quién le toca**.

Las dos primeras las fijó el negocio. El resto se derivan de ellas o resuelven lo que quedaba
abierto en el [análisis del servidor de accesos](analisis-servidor-accesos.md) y en el
[contrato del MVP](mvp-minimo-y-contrato-iot.md).

## Las tres capas

```text
Backend DT4FM (Render + Postgres)     AUTORIDAD DE NEGOCIO
  reserva, huésped, empleado, ciclo de vida, PIN, portal
        │  HTTPS · Cloudflare Access · service token
        ▼
VPS central (Cloudflare Tunnel)        AUTORIDAD DE DISPOSITIVOS
  inventario, employeeNo, orquestación, eventos
        │  credencial por gateway
        ▼
Gateway por edificio                   EJECUCIÓN
  ISAPI, credenciales del equipo en sitio
        ▼
Terminales Hikvision                   DECISIÓN SIN RED
```

**Regla que ordena todo lo demás:** cada capa manda sobre lo que la de abajo no puede saber, y
ninguna duplica lo que la de arriba ya decidió.

## Índice de decisiones

| # | Decisión | Responsable |
|---|---|---|
| [D-01](#d-01--el-backend-lleva-el-ciclo-de-vida-de-la-credencial) | El backend lleva el ciclo de vida | Fijada |
| [D-02](#d-02--el-portal-del-huésped-es-de-dt4fm) | El portal del huésped es de DT4FM | Fijada |
| [D-03](#d-03--la-vps-no-guarda-pines-ni-intención) | La VPS no guarda PINs ni intención | IoT |
| [D-04](#d-04--la-conciliación-la-hace-el-backend) | La conciliación la hace el backend | Ambos |
| [D-05](#d-05--el-tramo-vps--gateway-es-síncrono) | El tramo VPS ↔ gateway es síncrono | IoT |
| [D-06](#d-06--identidad-de-la-credencial-y-espacio-de-nombres) | Identidad y espacio de nombres | Ambos |
| [D-07](#d-07--el-tiempo-utc-por-dentro-offset-en-el-cable) | Tiempo: UTC dentro, offset en el cable | Ambos |
| [D-08](#d-08--errores-tipados-y-regeneración-por-conflicto-de-pin) | Errores tipados y conflicto de PIN | Ambos |
| [D-09](#d-09--autenticación-distinta-en-cada-tramo) | Autenticación distinta por tramo | Ambos |
| [D-10](#d-10--el-pin-en-tránsito-y-nunca-en-reposo) | El PIN en tránsito, nunca en reposo | Ambos |
| [D-11](#d-11--mitigaciones-del-pin-de-cuatro-dígitos) | Mitigaciones del PIN de 4 dígitos | IoT |
| [D-12](#d-12--la-consola-local-se-queda-como-salida-de-emergencia) | Consola local como *break-glass* | IoT |
| [D-13](#d-13--auditoría-de-aperturas) | Auditoría de aperturas | IoT → backend |
| [D-14](#d-14--purga-y-capacidad) | Purga y capacidad | Ambos |
| [D-15](#d-15--el-inventario-se-pagina-siempre) | El inventario se pagina siempre | IoT |
| [D-16](#d-16--un-repositorio-despliegue-parametrizado) | Un repositorio, no uno por edificio | IoT |
| [D-17](#d-17--servicio-persistente-y-latido) | Servicio persistente y latido | IoT |

---

## D-01 · El backend lleva el ciclo de vida de la credencial

**Decisión.** `access_credential` en el Postgres del backend es la única autoridad sobre qué PIN
existe, para quién, con qué vigencia y en qué estado. La VPS central **no** lleva ciclo de vida.

**Por qué.** Todos los hechos que gobiernan una credencial —reserva de Hostaway, `CleaningTask`,
cancelación, cambio de fechas— llegan al backend y a ningún otro sitio.

**Consecuencias.** La VPS no tiene tabla `users` con intención. Ver [D-03](#d-03--la-vps-no-guarda-pines-ni-intención).
El `sync` que hoy sobrescribe la base con lo leído del aparato cambia de sentido: ver
[D-04](#d-04--la-conciliación-la-hace-el-backend).

---

## D-02 · El portal del huésped es de DT4FM

**Decisión.** El portal se implementa en el backend, sobre `guest_stay`, enlace firmado y canje con
segundo factor. **Sale del alcance de la VPS central.**

**Por qué.** El portal se alimenta de la reserva. Construirlo del lado IoT obligaría a replicar
Hostaway allí y a que el PIN saliera por un segundo camino.

**Consecuencias.** El hostname de huéspedes que preveía el plan de IoT no se crea. El
`iot.construiblec.cloud` queda para personal, detrás de Cloudflare Access, y el portal vive en el
dominio del backend con su propia sesión de 30 minutos.

---

## D-03 · La VPS no guarda PINs ni intención

**Decisión.** El modelo de la VPS central se reduce a cuatro cosas, y **ninguna es el PIN**:

| Tabla | Qué guarda |
|---|---|
| `gateways` | Un registro por edificio: credencial propia hasheada, latido, versión del agente |
| `devices` | `deviceId`, gateway, ámbito, capacidad, firmware, último contacto. **Sin credenciales ISAPI** — viven en el gateway |
| `placements` | `credentialId` ↔ `deviceId` ↔ `employeeNo`, estado y último error |
| `events` | Aperturas y denegaciones, con clave de deduplicación |

`placements` es la `credential_placement` que el backend soltó: no desapareció, cambió de dueño.
Es lo único que permite borrar con precisión y detectar huérfanos.

**Por qué.** Si la intención vive arriba, replicarla abajo crea dos verdades y ninguna forma de
saber cuál gana. Y guardar el PIN convierte un volcado de la VPS en la llave de todos los
edificios — hoy `users.pin` y `device_users.pin_on_device` están en claro en SQLite, con un índice
encima.

**Consecuencias.** La VPS recibe el PIN en el `PUT`, lo escribe y **lo descarta**. El inventario
que lee por ISAPI **también** trae PINs, porque `UserInfo/Search` devuelve `password`: hay que
descartarlos en memoria, no persistirlos y no registrarlos. Es una regla de código, no de
configuración, y merece una prueba que la fije.

---

## D-04 · La conciliación la hace el backend

**Decisión.** Se invierte el sentido. El gateway **informa** lo que hay en el terminal; el backend
compara contra `access_credential` y decide. El aparato deja de ser fuente de verdad.

**Cómo.** Nocturno, por dispositivo:

1. El backend pide `GET /v1/devices/{deviceId}/inventory` con cursor.
2. La VPS devuelve, por usuario: `employeeNo`, `name`, `validFrom`, `validTo` y `managed` (si
   lleva el prefijo reservado). **Nunca el PIN.**
3. El backend cruza contra sus credenciales vivas y actúa:

| Situación | Acción |
|---|---|
| En Postgres como escrita, ausente del aparato | Reemitir el `PUT`. Se reescribe sola |
| Con prefijo reservado y sin credencial viva detrás | `DELETE`. Es basura de una revocación fallida |
| **Sin** prefijo reservado | **Reportar y no tocar.** Es un residente cargado a mano |
| Presente en ambos con vigencia distinta | Reemitir el `PUT` con el valor de Postgres |

**Por qué el backend y no la VPS.** Quien compara tiene que conocer la intención, y la intención
está en Postgres ([D-01](#d-01--el-backend-lleva-el-ciclo-de-vida-de-la-credencial)). Además así
la corrección es un `PUT` idempotente normal: no hace falta ningún camino de escritura especial ni
que la VPS conserve el PIN para reescribir.

**La tercera fila es la que protege a la gente.** Un barrido que borre lo desconocido deja a
residentes fuera de su casa. Nunca se borra lo que este sistema no creó.

---

## D-05 · El tramo VPS ↔ gateway es síncrono

**Decisión.** La VPS alcanza al gateway cuando quiere, por un túnel persistente, y el `PUT` se
relaya en el momento. **El gateway no sondea.**

**Por qué.** Es lo que mantiene la promesa de [D-10](#d-10--el-pin-en-tránsito-y-nunca-en-reposo):
si el gateway pregunta, la VPS tiene que retener la escritura hasta que llegue, y el PIN acaba en
su disco. Además el resultado real llega en la respuesta, sin callbacks ni estados intermedios.

**Consecuencias.** El gateway escucha **solo dentro del túnel**, nunca en una interfaz pública, y
autentica cada solicitud de la VPS ([D-09](#d-09--autenticación-distinta-en-cada-tramo)).

**Camino degradado, si resultara inevitable el sondeo.** Entonces, y solo entonces: el PIN se cifra
en reposo con AES-256-GCM y clave fuera de la base, se borra en cuanto el gateway confirma, tiene
TTL corto, y la VPS devuelve `queued` más un callback al backend para que la credencial no se quede
en `pending` hasta el siguiente barrido. Es peor, y hay que asumirlo por escrito si se elige.

---

## D-06 · Identidad de la credencial y espacio de nombres

**Decisión.**

* El **`credentialId` lo propone el backend** (uuid) y viaja en la URL del `PUT`.
* El `employeeNo` del terminal se **deriva** de él, con prefijo reservado:
  `DT4-G-<8 hex>` huésped · `DT4-T-<8 hex>` residente · `DT4-E-<8 hex>` personal.
* **Nunca se reutiliza** un `employeeNo`, aunque su credencial haya sido borrada.
* **Nunca se borra** un usuario del terminal sin prefijo `DT4-`.

**Por qué.** Tres cosas a la vez. Hace la escritura **idempotente** —reenviar el mismo `PUT` apunta
al mismo registro, no crea un segundo—; hace la revocación **precisa**, porque se sabe exactamente
qué borrar; y separa lo que creó el sistema de lo que cargó una persona.

**Qué corrige.** Hoy `next_available_employee_no()` devuelve el entero libre más bajo y el borrado
elimina la fila, así que **el número de un huésped que se fue se reasigna al siguiente**. Cualquier
evento histórico quedaría atribuido a la persona equivocada. Y sin prefijo, un `employeeNo` `"7"`
puede coincidir con un residente cargado por iVMS-4200 y la escritura lo sobrescribiría.

---

## D-07 · El tiempo: UTC por dentro, offset en el cable

**Decisión.** Tres reglas:

1. **En reposo**, cada sistema guarda en UTC (`timestamptz` en Postgres).
2. **En el cable**, todas las marcas van en ISO 8601 **con offset explícito**.
3. **La conversión a hora local del equipo ocurre en un único punto**: el gateway, justo antes de
   serializar el `UserInfo` de ISAPI, usando la zona configurada de ese edificio.

**Por qué.** Hoy `require_local_datetime()` **rechaza** cualquier marca con `tzinfo`, y el cliente
envía `timeType: "local"`. Todo el sistema es de hora ingenua, y una marca ingenua no significa
nada fuera del proceso que la escribió: basta un contenedor con otro `TZ` para desplazar todas las
vigencias sin un solo error visible.

**Nota justa.** Quito es UTC−5 todo el año, sin horario de verano, así que el riesgo real hoy es
menor que en el caso general. Eso no lo hace correcto: el arreglo es barato ahora y caro cuando
haya un edificio en otra zona o un servidor en otra región.

**Consecuencias.** El validador del gateway pasa a **exigir** offset en vez de rechazarlo. La zona
del edificio se vuelve configuración explícita, no un supuesto del host.

---

## D-08 · Errores tipados, y regeneración por conflicto de PIN

**Decisión.** Toda respuesta de error lleva un `code` estable, no solo texto. Mínimo:

| `code` | Significado | Qué hace el backend |
|---|---|---|
| `gateway_unreachable` | Túnel del edificio caído | Reintenta con retroceso |
| `device_unreachable` | LAN del edificio, un aparato | Marca `partial` y reintenta ese |
| `pin_conflict` | El terminal rechaza el PIN por duplicado | **Regenera el PIN y reemite** |
| `device_full` | Tope de usuarios alcanzado | Alerta operativa, no reintenta |
| `unauthorized` | Credencial de servicio inválida | Alerta, no reintenta |
| `invalid_request` | Cuerpo mal formado | No reintenta |

**Por qué `pin_conflict` merece su propio código.** Con cuatro dígitos hay 10.000 combinaciones por
edificio y ámbito, compartidas con los residentes cargados a mano, que el backend no conoce. El
índice único de Postgres garantiza unicidad **entre lo que el backend emite**, no frente a lo que
ya había en el aparato.

Resolverlo con un endpoint de «¿está libre este PIN?» sería peor: crearía un **oráculo de
enumeración**. En cambio, dejar que la escritura falle y regenerar es autocorrector, no filtra nada
y no añade superficie. El generador ya tiene el bucle de reintentos; solo hay que enchufarle este
error.

**Consecuencias.** El backend limita los reintentos y, agotados, deja la credencial en `failed`
con alerta. Un `pin_conflict` repetido en el mismo edificio es señal de saturación del espacio,
no de mala suerte.

---

## D-09 · Autenticación distinta en cada tramo

**Decisión.** Tres tramos, tres mecanismos, ningún secreto compartido entre ellos.

| Tramo | Mecanismo |
|---|---|
| Backend → VPS | **Cloudflare Access con *service token*.** El backend envía `CF-Access-Client-Id` y `CF-Access-Client-Secret`; el origen valida el JWT `Cf-Access-Jwt-Assertion` **y** es inalcanzable directamente |
| VPS → gateway | **Credencial propia por gateway**, hasheada en la VPS, con versión y rotación |
| Gateway → terminal | Digest ISAPI, **usuario distinto por dispositivo**, secreto por variable de entorno en sitio |

**Por qué el service token y no una lista blanca de IP.** Render no garantiza IP de salida: una
allowlist rompería en cada despliegue. Y validar el JWT en el origen es lo que impide que alguien
que alcance la VPS por otra ruta se limite a inventarse la cabecera.

**Por qué credencial por gateway y no un token de flota.** Es la lección de la §13.1 del diseño
original: con un secreto único, un edificio comprometido entrega todos, y no hay forma de revocar
uno sin revocarlos todos.

**Consecuencias.** Desaparece la comprobación de `Origin` en las rutas máquina — es una defensa
CSRF pensada para navegadores y solo obligaría al backend a fingir una cabecera. Se queda tal cual
para la consola local ([D-12](#d-12--la-consola-local-se-queda-como-salida-de-emergencia)).

---

## D-10 · El PIN en tránsito y nunca en reposo

**Decisión.** El PIN existe cifrado en un solo lugar del mundo: `access_credential.pin_ciphertext`,
con AES-256-GCM y clave fuera de `DATABASE_URL`. Fuera de ahí solo aparece:

* En el cuerpo del `PUT` del backend a la VPS, sobre TLS.
* En el cuerpo ISAPI del gateway al terminal, dentro de la LAN aislada.
* En la respuesta de `GET /guest/me/credentials`, al huésped que es su dueño.

**Prohibiciones explícitas**, que valen para las tres capas:

* No persistir el PIN en la VPS ni en el gateway, ni siquiera transitoriamente en la cola.
* No registrarlo en logs, en ningún nivel, ni dentro de un volcado de cuerpo de petición.
* No devolverlo en respuestas de operación: los listados exponen `pinConfigured` booleano.
* **Descartar los PINs que devuelve el inventario ISAPI** ([D-03](#d-03--la-vps-no-guarda-pines-ni-intención)).
* No enviarlo por correo ni por mensaje de Hostaway. Solo viaja el enlace al portal.

**Por qué no se hashea.** Porque el portal tiene que mostrárselo al huésped cada vez que abre el
panel, no solo al emitirlo. Se compensa con clave separada, cifrado autenticado, y `decrypt()` en
**un único punto del código**: el endpoint que se lo enseña a su dueño.

---

## D-11 · Mitigaciones del PIN de cuatro dígitos

**Decisión.** Cuatro dígitos son 10.000 combinaciones y las puertas están en modo PIN solo, así que
el PIN por sí solo abre. Tres controles dejan de ser opcionales:

1. **Bloqueo por intentos fallidos en el terminal**, activado en el aprovisionamiento de cada
   dispositivo y verificado. Es la mitigación que sustituye a la longitud, y está en el hardware,
   no en el software.
2. **Rechazo de PINs débiles en el generador**: repeticiones, escaleras ascendentes y descendentes,
   y los años `19xx` y `20xx`, que un huésped teclea por instinto y un atacante prueba primero.
   Cuesta menos del 5 % del espacio.
3. **Alerta por ráfaga de `access_denied`** sobre la misma puerta. Es la señal de fuerza bruta, y
   hasta que exista `access_event` en el backend, **la detección es de la VPS**
   ([D-13](#d-13--auditoría-de-aperturas)).

**El enfriamiento aguanta.** Un edificio de 40 unidades con rotación de cuatro días emite unos 300
PINs de huésped al mes, un 3 % del espacio; con 30 días de enfriamiento el generador encuentra
hueco sin esfuerzo. El riesgo del PIN corto es la fuerza bruta, no el agotamiento.

---

## D-12 · La consola local se queda como salida de emergencia

**Decisión.** El frontend del gateway y sus rutas `/api/` **no se retiran**. Quedan como
*break-glass* cuando el backend o el túnel no estén disponibles, sujetos a tres reglas:

* Lo que se cree a mano **no lleva el prefijo `DT4-`**, y por tanto la conciliación lo reporta y no
  lo toca ([D-04](#d-04--la-conciliación-la-hace-el-backend)).
* Escrituras y control físico siguen **apagados por defecto**, con sus flags separados.
* Cada uso queda en el historial, y la operación posterior se reconcilia con el backend.

**Por qué conservarla.** Una puerta que no abre a las once de la noche no espera a que Render
despierte. Un camino manual documentado es parte del diseño, no una concesión — y ya está
construido, probado y endurecido.

---

## D-13 · Auditoría de aperturas

**Decisión.** Hoy no existe en ningún sitio: nada lee `AcsEvent`. Se construye en tres pasos.

1. **El gateway lee los eventos** del terminal por rango de tiempo, periódicamente, y los
   bufferiza localmente. Es quien tiene la LAN, y el buffer es lo único irrecuperable si se pierde,
   porque el terminal rota su histórico.
2. **La VPS los consolida** y los expone en `GET /v1/events?from=&to=&cursor=`, con retención
   declarada por escrito.
3. **El backend los consulta bajo demanda** mientras no exista `access_event`. Cuando esa tabla
   vuelva, se añade el empuje a `POST /iot/access-events`, idempotente por `eventId`.

**Por qué en ese orden.** Empujar solo tiene sentido si hay dónde guardar; un webhook que recibe
eventos para descartarlos es infraestructura sin destinatario. Pero **la fuente hay que construirla
ya**, porque de ella depende la alerta de fuerza bruta de
[D-11](#d-11--mitigaciones-del-pin-de-cuatro-dígitos).

**Correlación.** El evento trae `employeeNo`; el prefijo de [D-06](#d-06--identidad-de-la-credencial-y-espacio-de-nombres)
permite resolverlo a `credentialId` sin ambigüedad, y la regla de no reutilizar números es lo que
impide atribuir una apertura a la persona equivocada.

---

## D-14 · Purga y capacidad

**Decisión.** Un barrido diario del backend recorre las credenciales `expired` y `revoked` que
sigan escritas y emite el `DELETE`. Cuando la VPS confirma, la credencial pasa a purgada y el PIN
entra en enfriamiento.

**Por qué no basta con dejar vencer.** El terminal ignora una credencial fuera de vigencia, pero
**el registro sigue ocupando sitio**. Los huéspedes rotan, y en unos meses el equipo alcanza su tope
y **rechaza altas nuevas**. No es higiene opcional, es requisito funcional.

**Consecuencias.** `GET /v1/devices` reporta `usersUsed` y `usersCapacity`, y el backend alerta
antes del límite en vez de descubrirlo con un `device_full`
([D-08](#d-08--errores-tipados-y-regeneración-por-conflicto-de-pin)).

---

## D-15 · El inventario se pagina siempre

**Decisión.** Toda lectura de usuarios del terminal recorre `searchResultPosition` hasta agotar el
listado. Ninguna operación de inventario usa un tope fijo.

**Qué corrige.** `get_users(max_results=50)` con posición fija en `0`, seguido de
`DELETE FROM device_users WHERE device_id = ?`. En un terminal con más de 50 usuarios **cada
sincronización borra del espejo a todos los demás**: el aparato queda intacto, pero el inventario y
el reporte de duplicados dejan de ser fiables sin que nada falle.

**Consecuencias.** La conciliación de [D-04](#d-04--la-conciliación-la-hace-el-backend) depende de
que el inventario esté completo; con paginación parcial, borraría credenciales legítimas por
creerlas ausentes. **Esta corrección es prerrequisito de D-04**, no una mejora paralela.

---

## D-16 · Un repositorio, despliegue parametrizado

**Decisión.** Un único código de gateway, desplegado N veces con su propio
`config/buildings.json` y sus variables de entorno. **No un repositorio por edificio.**

**Por qué.** Cuatro edificios serían cuatro copias divergiendo, con la corrección de un fallo
aplicada cuatro veces y olvidada en alguna. El código ya está parametrizado por configuración: la
separación por edificio es un dato, no una rama.

**Consecuencias.** Lo que hoy es «preparar el repositorio equivalente de Pradera» pasa a ser añadir
un despliegue y su configuración. La consolidación de datos de Inglaterra y Pradera sigue exigiendo
la migración ensayada que ya está prevista, con clave de edificio explícita.

---

## D-17 · Servicio persistente y latido

**Decisión.** El gateway corre como servicio `systemd` con `Restart=on-failure`, usuario dedicado
sin login y permisos mínimos. La VPS registra `lastSeenAt` por gateway y **alerta cuando se
enfría**.

**Por qué.** Un reinicio de la Raspberry el 03-09-2026 terminó el proceso y no había systemd, cron
ni multiplexor: el servicio simplemente dejó de existir. Y un gateway caído **no produce errores
visibles** — las puertas siguen abriendo con lo ya sincronizado, pero las altas y las revocaciones
dejan de aplicarse en silencio. Ese es el fallo peligroso del módulo.

**Consecuencias.** `GET /v1/health` distingue los dos eslabones —`gatewayOnline` para el túnel y
`online` por dispositivo para la LAN— porque son incidentes distintos con responsables distintos.
El backend lo consulta a diario en `/access/health` y alerta sobre el latido, no solo sobre errores.

---

## Qué queda pendiente de decidir

Nada bloquea el desarrollo. Lo que falta es acuerdo operativo, no diseño:

* Retención de eventos en la VPS y hasta qué fecha se puede consultar hacia atrás.
* Latencia máxima comprometida entre el `PUT` y el PIN funcionando en la puerta — decide si el
  panel dice «tu PIN» o «tu PIN se está activando».
* Plazo de anonimización de los datos personales de `guest_stay` tras el check-out.
* Ventana y responsable de la migración de la base de Inglaterra y Pradera.
