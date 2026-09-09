# Guía de implementación — VPS central de accesos

**Para Ingeniería IoT.** Todo lo que la VPS central tiene que exponer para que el backend DT4FM
gestione los PINes de las puertas.

El backend **ya está implementado y probado** contra una simulación de este contrato
([access-iot.mock.ts](../../src/modules/access-control/access-iot.mock.ts)). Cuando la VPS
responda como se describe aquí, se cambia una variable de entorno y funciona. **Si el mock y este
documento divergen, manda este documento.**

---

## 1. El reparto, en una frase

**El backend decide qué PIN existe, para quién y hasta cuándo. La VPS lo escribe en el hardware y
reporta qué pasó.**

```text
Backend DT4FM (Render + Postgres)     AUTORIDAD DE NEGOCIO
  reserva, huésped, ciclo de vida, PIN, portal
        │  HTTPS · Cloudflare Access · service token
        ▼
VPS central  ◀── La parte de IoT           AUTORIDAD DE DISPOSITIVOS
  inventario, employeeNo, orquestación, eventos
        │  credencial propia por gateway
        ▼
Gateway por edificio ◀── La parte de IoT    EJECUCIÓN
  ISAPI dentro de la LAN aislada
        ▼
Terminales Hikvision                 DECISIÓN SIN RED
```

**La conversación es de una sola dirección: el backend llama, la VPS responde.** No hay callbacks ni
webhooks de retorno, y el backend no expone nada que la VPS deba consumir. Si una escritura no se
puede completar, se contesta el fallo y se olvida — **quien reintenta es el backend**, que tiene la
credencial en `sync_state = 'pending'` y un barrido cada 10 minutos.

### Lo que NO va en la VPS

| No va | Por qué |
|---|---|
| **Ciclo de vida de la credencial** | Reserva, cancelación y cambio de fechas llegan al backend y a ningún otro sitio. Replicar la intención abajo crea dos verdades y ninguna forma de saber cuál gana |
| **Portal del huésped** | Se alimenta de la reserva. Construirlo aquí obligaría a replicar Hostaway y a que el PIN saliera por un segundo camino. El hostname de huéspedes que preveía el plan de IoT no se crea |
| **El PIN, en reposo** | Ver [§7](#7-el-pin-la-regla-más-importante) |

La consola local del gateway **sí se conserva**, como salida de emergencia. Ver [§10](#10-la-consola-local).

---

## 2. Lo primero: los identificadores

Bloquean todo lo demás.

| Acuerdo | Por qué es crítico |
|---|---|
| **`buildingId` = `Building._id` de openMAINT**, entero | Es la clave con la que el backend decide dónde colocar una credencial. Si la VPS usa nombres propios (`torre-a`) hace falta una tabla de mapeo. Reales: Inglaterra `3025058`, Pradera `3019998`, Republica `564939` |
| **`credentialId` lo propone el backend** (uuid) y viaja en la URL | De él derivas el `employeeNo`. Es lo que hace idempotente reenviar una escritura y precisa una revocación |
| **Prefijo `DT4-` en `employeeNo`** | Marca lo creado por este sistema. **Nunca borrar un usuario sin ese prefijo** |
| **`unitId` = `Unit._id`**, opcional | Solo contexto. El acceso no puede depender de que el mapeo exista |
| **`deviceId`** lo eliges tú, estable | El backend lo guarda en `sync_detail` y lo usa para conciliar. Si cambia, pierde la traza |

**No se usa `Building.Code`** como clave: openMAINT no garantiza que sea único ni inmutable. Los
códigos de tres letras (`ING`, `PRA`, `BAT`, `REP`) se conservan como **etiqueta legible** — se opera
con el entero y se lee con el código, por eso `GET /v1/buildings` devuelve los dos.

### El `employeeNo` que se escribe en el terminal

Se **deriva** del `credentialId`, con prefijo reservado según el tipo de sujeto:

```
DT4-G-<8 hex>   huésped
DT4-T-<8 hex>   residente
DT4-E-<8 hex>   personal
```

Los 8 hex son los primeros 8 caracteres del SHA-256 del `credentialId`. El `subjectType` viaja en el
cuerpo del `PUT` justo para que puedas derivar el prefijo.

**Tres reglas, y las tres importan:**

1. **Nunca reutilices un `employeeNo`**, aunque su credencial se haya borrado. Hoy
   `next_available_employee_no()` devuelve el hueco más bajo, así que el número de un huésped que se
   fue se reasigna al siguiente: cualquier evento histórico quedaría atribuido a la persona
   equivocada.
2. **Nunca borres un usuario sin prefijo `DT4-`.** Un `employeeNo` `"7"` puede ser un residente
   cargado a mano por iVMS-4200. Un barrido «limpiador» deja gente fuera de su casa.
3. Derivar en vez de autonumerar hace la escritura **idempotente**: reenviar el mismo `PUT` apunta al
   mismo registro, no crea un segundo.

---

## 3. Conexión y autenticación

### Backend → VPS

**Cloudflare Access con *service token*.** El backend envía en cada petición:

```
CF-Access-Client-Id:     <client-id>
CF-Access-Client-Secret: <client-secret>
```

El origen debe validar el JWT `Cf-Access-Jwt-Assertion` **y** ser inalcanzable por otra ruta. Si solo
se comprueba la cabecera, cualquiera que llegue al origen por fuera del túnel se la inventa.

**No una lista blanca de IP:** Render no garantiza IP de salida y una allowlist rompería en cada
despliegue.

### VPS → gateway

**Credencial propia por gateway**, hasheada en la VPS, con versión y rotación. No un token de flota:
con un secreto único, un edificio comprometido entrega todos y no hay forma de revocar uno solo.

El gateway escucha **únicamente dentro del túnel**, nunca en una interfaz pública, y autentica cada
solicitud.

### Gateway → terminal

Digest ISAPI, **usuario distinto por dispositivo**, secreto por variable de entorno en sitio. Las
credenciales ISAPI viven en el gateway, no en la VPS.

### Lo que se necesita de IoT

- **URL base con TLS y certificado válido, una por entorno.** Se necesita **staging**: no se va a
  desarrollar ni testear contra las puertas de un edificio habitado.
- **El service token** (`client-id` y `client-secret`), que se guarda como `ACCESS_IOT_TOKEN` con el
  formato `<client-id>:<client-secret>`.
- **Procedimiento de rotación sin caída**: aceptar el token anterior y el nuevo durante un plazo.
- **Límites**: cuánto tarda como máximo una escritura, cuántas peticiones por minuto aguanta los servidores IoT, y qué se devuelve al limitar (`429` + `Retry-After`).

---

## 4. Los endpoints que se deben exponer

Siete operaciones. Es exactamente lo que el backend llama hoy
([access-iot.client.ts](../../src/modules/access-control/access-iot.client.ts)).

Todas las marcas de tiempo, en cuerpo y respuesta, van en **ISO 8601 con offset explícito**. Ver
[§6](#6-el-tiempo).

### `GET /v1/buildings` — catálogo

El backend lo consulta antes de emitir, para validar que el edificio existe y saber si tiene ámbito
vehicular. Lo cachea 10 minutos.

```json
[
  { "buildingId": 3025058, "code": "ING", "name": "Inglaterra", "online": true,
    "scopes": ["pedestrian", "vehicular"], "lastSeenAt": "2026-09-08T09:41:12-05:00" }
]
```

**Un edificio que no figure aquí no recibe credenciales**, sin error. Así que este endpoint es el
interruptor real de la cobertura: añadir hardware a un edificio nuevo es una operación de IoT, y el
backend se entera solo.

### `GET /v1/devices` — inventario de aparatos

```json
[
  { "deviceId": "ING-PEATONAL-1", "buildingId": 3025058, "kind": "terminal",
    "scope": "pedestrian", "online": true, "usersUsed": 812, "usersCapacity": 3000,
    "firmware": "V3.2.60", "clockSkewSeconds": 2, "lastSeenAt": "2026-09-08T09:41:12-05:00" }
]
```

`usersUsed` / `usersCapacity` importan más de lo que parecen: los huéspedes rotan, y si los
registros vencidos no se borran el equipo se llena y **deja de aceptar altas**.

### `PUT /v1/credentials/{credentialId}` — alta y actualización

`PUT` y no `POST` a propósito: **idempotente por definición**. Reenviarlo con el mismo cuerpo deja el
mismo resultado, no duplica ni falla. Es también el endpoint de los cambios de fecha y de ámbito,
donde **el PIN no cambia** y solo se mueve la vigencia.

Cuerpo que envía el backend:

```json
{
  "buildingId": 3025058,
  "scope": "pedestrian",
  "subjectType": "guest",
  "pin": "4821",
  "validFrom": "2026-09-14T12:00:00-05:00",
  "validTo":   "2026-09-18T15:00:00-05:00",
  "displayName": "Ana Perez",
  "unitId": 1187
}
```

- `scope` — `pedestrian` / `vehicular` / `both`. Determina en qué dispositivos del edificio se escribe.
  `both` = todos.
- `subjectType` — `guest` / `tenant` / `employee`. Solo para derivar el prefijo del `employeeNo`.
- `unitId` — puede venir `null`. No condiciona el acceso.

Respuesta, **con detalle por dispositivo**:

```json
{
  "credentialId": "3f9a2b11-...",
  "state": "partial",
  "devices": [
    { "deviceId": "ING-PEATONAL-1", "state": "written",
      "employeeNo": "DT4-G-3f9a2b11", "at": "2026-09-08T09:41:13-05:00" },
    { "deviceId": "ING-VEHICULAR-1", "state": "unreachable", "error": "link down" }
  ]
}
```

`state` agregado, cuatro valores:

| `state` | Significado | Qué hace el backend |
|---|---|---|
| `written` | Escrita en **todos** los dispositivos del ámbito | `active` / `synced` |
| `partial` | En algunos sí, en otros no | Sigue `pending`, reintenta los que faltan |
| `unreachable` | El edificio no responde | Sigue `pending`, reintenta |
| `failed` | Falló de verdad | Mira `errorCode` |

**`partial` no es un error.** Un huésped con el PIN en el portal peatonal pero no en la barrera puede
entrar a pie, y el panel debe poder decirlo.

**`unreachable` significa que devuelves el fallo, no que encolas.** No retengas la petición: si el
edificio no responde, contesta y olvida. El motivo es de seguridad y está en
[§7](#7-el-pin-la-regla-más-importante) — encolar obliga a guardar el PIN en tu disco.

El arreglo `devices` se guarda tal cual en `access_credential.sync_detail`, y el `employeeNo` de cada
entrada es lo que después usa la conciliación. **Devuélvelo siempre en las entradas `written`.**

### `DELETE /v1/credentials/{credentialId}` — revocación

Misma forma de respuesta. **Debe ser idempotente: borrar algo ya borrado devuelve éxito, no `404`.**
Es la operación crítica del módulo y la que no puede quedarse a medias en silencio.

### `GET /v1/credentials/{credentialId}` — estado real

Lo que ves **hoy en el dispositivo**, no lo que recuerdas. Misma forma que el `PUT`. **`404` si no
existe** — el backend lo traduce a «no está» y no a un error.

### `GET /v1/health` — salud

**Debe separar los dos eslabones**: el túnel al edificio y la LAN dentro de él. Con cuatro planos, un
`online: false` a secas no dice a quién llamar.

```json
{ "buildings": [
  { "buildingId": 3025058,
    "gatewayOnline": true,
    "gatewayLastSeenAt": "2026-09-08T09:41:12-05:00",
    "gatewayVersion": "1.4.2",
    "pendingJobs": 0, "failedJobs": 1, "maxClockSkewSeconds": 3,
    "devices": [
      { "deviceId": "ING-PEATONAL-1", "online": true },
      { "deviceId": "ING-VEHICULAR-1", "online": false, "lastSeenAt": "2026-09-08T02:10:00-05:00" }
    ] } ] }
```

Es la pantalla que hay que mirar a diario, porque **un edificio incomunicado no produce errores
visibles**: las puertas siguen abriendo con lo ya sincronizado, pero altas y revocaciones dejan de
aplicarse en silencio. Ese es el fallo peligroso del módulo. **Debe existir una alerta sobre
`gatewayLastSeenAt` cuando se enfríe.**

### `GET /v1/devices/{deviceId}/inventory?cursor=` — usuarios del terminal

Lo consume la conciliación nocturna del backend.

```json
{ "users": [
    { "employeeNo": "DT4-G-3f9a2b11", "name": "Ana Perez",
      "validFrom": "2026-09-14T12:00:00-05:00", "validTo": "2026-09-18T15:00:00-05:00",
      "managed": true },
    { "employeeNo": "LOCAL-77", "managed": false }
  ],
  "nextCursor": "eyJwb3MiOjIwMH0" }
```

- `managed` — `true` si el `employeeNo` lleva el prefijo reservado. Es lo que protege a los
  residentes cargados a mano.
- `nextCursor` — `null` o ausente cuando se acabó. El backend pagina hasta agotar, con un tope
  defensivo de 50 páginas.
- **Nunca el PIN.** `UserInfo/Search` de ISAPI devuelve `password`: descártalo en memoria.

**Pagina siempre por dentro también.** Hoy `get_users(max_results=50)` con `searchResultPosition: 0`
fijo, seguido de `DELETE FROM device_users WHERE device_id = ?`, hace que en un terminal con más de
50 usuarios **cada sincronización borre del espejo a todos los demás**. El aparato queda intacto,
pero el inventario deja de ser fiable sin que nada falle. Y la conciliación del backend depende de
que el inventario esté completo: con paginación parcial, reescribiría credenciales por creerlas
ausentes. **Es prerrequisito, no una mejora paralela.**

---

## 5. Errores: tipados, no texto

Toda respuesta de error lleva un `code` estable. El backend **distingue reintentar de regenerar de
alertar**, y sin código no puede.

| `code` | Significado | Qué hace el backend |
|---|---|---|
| `gateway_unreachable` | Túnel del edificio caído | Reintenta con retroceso |
| `device_unreachable` | Un aparato dentro de la LAN | `partial`, reintenta ese |
| `pin_conflict` | El terminal rechaza el PIN por duplicado | **Regenera el PIN y reemite**, hasta 3 veces |
| `device_full` | Tope de usuarios alcanzado | Alerta. **No reintenta** |
| `unauthorized` | Service token inválido | Alerta. No reintenta |
| `invalid_request` | Cuerpo mal formado | No reintenta |

**Dos formas válidas de devolverlos**, y el backend acepta las dos:

```jsonc
// A) 200 con el desenlace en el cuerpo — es lo que hace el mock
{ "credentialId": "3f9a…", "state": "failed", "devices": [], "errorCode": "pin_conflict" }

// B) status no-2xx con el código en el cuerpo
{ "code": "pin_conflict", "message": "PIN duplicado en ING-PEATONAL-1" }
```

**`pin_conflict` merece su propio código.** Con cuatro dígitos hay 10.000 combinaciones por edificio,
compartidas con los residentes cargados a mano que el backend no conoce. Su índice único garantiza
unicidad entre lo que él emite, **no frente a lo que ya había en el aparato**. Que la escritura falle
y el backend regenere es autocorrector.

**No exponer un endpoint de «¿está libre este PIN?».** Sería un oráculo de enumeración: con 10.000
combinaciones, alguien puede recorrerlas todas. Dejar fallar la escritura no filtra nada.

### Reintentos del lado del backend

Para que dimensiones: timeout de **15 s** por petición, **3 intentos** (uno más dos reintentos) con
espera creciente de 1,5 s. Reintenta ante `5xx`, `429` y errores de red. **Nunca** reintenta ante
`401`/`403`, `unauthorized`, `invalid_request`, `pin_conflict` ni `device_full`.

---

## 6. El tiempo

Tres reglas:

1. **En reposo**, cada sistema guarda en UTC.
2. **En el cable**, toda marca va en ISO 8601 **con offset explícito**.
3. **La conversión a hora local del equipo ocurre en un único punto**: el gateway, justo antes de
   serializar el `UserInfo` de ISAPI, con la zona configurada de ese edificio.

**Esto es un cambio respecto al gestor actual.** Hoy `require_local_datetime()` **rechaza** cualquier
marca con `tzinfo` y el cliente envía `timeType: "local"`. Todo el sistema es de hora ingenua, y una
marca ingenua no significa nada fuera del proceso que la escribió: basta un contenedor con otro `TZ`
para desplazar todas las vigencias sin un solo error visible. El validador debe pasar a **exigir**
offset en vez de rechazarlo.

Quito es UTC−5 todo el año, sin horario de verano, así que el riesgo real hoy es menor que en el caso
general. Eso no lo hace correcto: el arreglo es barato ahora y caro cuando haya un edificio en otra
zona o un servidor en otra región.

**Los terminales aplican la vigencia por sí mismos** (`beginTime` / `endTime`), así que la caducidad
es un dato, no una operación: la puerta sigue siendo correcta sin red.

---

## 7. El PIN: la regla más importante

**La VPS recibe el PIN en el `PUT`, lo escribe y lo descarta. No lo persiste jamás.**

Ni en la base, ni en la cola, ni transitoriamente. Hoy `users.pin` y `device_users.pin_on_device`
están en claro en SQLite, con un índice encima: **un volcado del fichero rinde todos los PINes del
edificio**. La API los oculta bien; el fichero no.

Con el reparto propuesto esto desaparece solo, y `pin_on_device` puede reducirse a un booleano o a
una huella.

**Prohibiciones explícitas:**

- No persistirlo en la VPS ni en el gateway.
- **No registrarlo en logs**, en ningún nivel, ni dentro de un volcado de cuerpo de petición.
- **Descartar los PINs que devuelve el inventario ISAPI.** `UserInfo/Search` incluye `password`:
  hay que soltarlo en memoria, no persistirlo y no loguearlo. Es una regla de código, no de
  configuración, y merece una prueba que la fije.
- No devolverlo en ninguna respuesta de este contrato.

En el backend el PIN existe cifrado en un solo sitio del mundo (`access_credential.pin_ciphertext`,
AES-256-GCM con clave fuera de `DATABASE_URL`), y se descifra en un único punto del código.

### PIN de 4 dígitos: lo que le toca al de IoT

Son 10.000 combinaciones y las puertas están en **modo PIN solo**, así que el PIN por sí solo abre.
Decisión del cliente, contra la recomendación de 6. Dos de las tres mitigaciones son de IoT:

1. **Bloqueo por intentos fallidos en el terminal**, activado en el aprovisionamiento de **cada**
   dispositivo y verificado. Es la mitigación que sustituye a la longitud, y está en el hardware.
2. **Alerta por ráfaga de `access_denied`** sobre la misma puerta. Es la señal de fuerza bruta, y
   hasta que el backend tenga `access_event`, **la detección es de la VPS**.
3. (Del backend) Rechazo de PINs débiles al generar: repeticiones, escaleras y años `19xx`/`20xx`.

El agotamiento del espacio no es el riesgo: un edificio de 40 unidades con rotación de cuatro días
emite unos 300 PINes al mes, un 3 %. El riesgo es la fuerza bruta.

---

## 8. Modelo de datos sugerido para la VPS

Cuatro cosas, y **ninguna es el PIN**:

| Tabla | Qué guarda |
|---|---|
| `gateways` | Un registro por edificio: credencial propia hasheada, latido, versión del agente |
| `devices` | `deviceId`, gateway, ámbito, capacidad, firmware, último contacto. **Sin credenciales ISAPI** — viven en el gateway |
| `placements` | `credentialId` ↔ `deviceId` ↔ `employeeNo`, estado y último error |
| `events` | Aperturas y denegaciones, con clave de deduplicación |

`placements` es la tabla que el backend soltó al reducir su esquema: no desapareció, cambió de dueño.
Es lo único que permite borrar con precisión y detectar huérfanos.

**Un repositorio, no uno por edificio.** Un único código de gateway desplegado N veces con su
`config/buildings.json` y sus variables. Cuatro edificios serían cuatro copias divergiendo, con la
corrección de un fallo aplicada cuatro veces y olvidada en alguna.

**El gateway corre como servicio `systemd` con `Restart=on-failure`**, usuario dedicado sin login y
permisos mínimos. Un reinicio de la Raspberry el 03-09-2026 terminó el proceso y no había systemd,
cron ni multiplexor: el servicio dejó de existir sin que nadie se enterara.

---

## 9. La conciliación, y por qué el backend la hace al revés

Se invierte el sentido respecto al gestor actual: **el gateway informa lo que hay en el terminal; el
backend compara contra su base y decide.** El aparato deja de ser fuente de verdad.

Hoy `sync` sobrescribe la base con lo que lee del aparato. Eso choca de frente con que la intención
viva en Postgres, y **no puede haber dos autoridades**. Hay un caso concreto donde el sentido actual
hace daño: `create_pin_access_user()` escribe dispositivo por dispositivo y, si el segundo falla, la
transacción no llega al `commit` **pero el primer terminal ya tiene el usuario escrito**. Como `sync`
importa lo que hay en el aparato, el siguiente barrido **lo adopta como legítimo**: un PIN que el
sistema cree que nunca existió queda abriendo una puerta indefinidamente y sin rastro.

Con el backend como autoridad se resuelve solo: reportas el estado por dispositivo, la credencial
queda en `pending` y el barrido reintenta.

Lo que hace el backend cada noche, por dispositivo:

| Situación | Acción |
|---|---|
| En Postgres como escrita, ausente del aparato | Reemite el `PUT`. Se reescribe sola |
| Con prefijo `DT4-` y sin credencial viva detrás | `DELETE`. Es basura de una revocación fallida |
| **Sin** prefijo `DT4-` | **Reporta y no toca.** Es un residente cargado a mano |
| En ambos con vigencia distinta | Reemite el `PUT` con el valor de Postgres |

La parte de IoT es que `GET /v1/devices/{id}/inventory` sea **completo** y que `managed` sea fiable.

---

## 10. La consola local

El frontend del gateway y sus rutas `/api/` **no se retiran**. Quedan como *break-glass* cuando el
backend o el túnel no estén disponibles. Una puerta que no abre a las once de la noche no espera a
que Render despierte, y ese camino manual ya está construido, probado y endurecido.

Tres reglas:

- Lo que se cree a mano **no lleva prefijo `DT4-`**, y por tanto la conciliación lo reporta y no lo
  toca.
- Escrituras y control físico siguen **apagados por defecto**, con sus flags separados.
- Cada uso queda en el historial, y la operación posterior se reconcilia con el backend.

Desaparece, eso sí, la comprobación de `Origin` **en las rutas máquina**: es una defensa CSRF pensada
para navegadores y solo obligaría al backend a fingir una cabecera. En la consola local se queda tal
cual.

---

## 11. Auditoría de aperturas

**Hoy no existe en ningún sitio**: nada lee `AcsEvent`, ni en el gestor actual ni en el backend.
Antes de discutir si se empuja o se consulta hay que construir la fuente. Tres pasos:

1. **El gateway lee los eventos** del terminal por rango de tiempo, periódicamente, y los
   bufferiza. Es quien tiene la LAN, y el buffer es lo único irrecuperable si se pierde, porque el
   terminal rota su histórico.
2. **La VPS los consolida** y los expone en `GET /v1/events?from=&to=&cursor=`, con **retención
   declarada por escrito**.
3. **El backend los consulta bajo demanda** mientras no exista la tabla `access_event`.

Cuando esa tabla vuelva se añade el empuje a `POST /iot/access-events`, idempotente por `eventId`, con
el patrón del `IotWebhookGuard` que ya existe. Harán falta **las dos vías**: empuje para la latencia y
consulta por rango para rellenar lo que el empuje pierda en cada reinicio de Render.

Forma acordada, para no renegociar el contrato después:

```json
{ "events": [
  { "eventId": "ING-PEATONAL-1:88123", "deviceId": "ING-PEATONAL-1",
    "buildingId": 3025058, "credentialId": "3f9a…", "employeeNo": "DT4-G-3f9a2b11",
    "eventType": "access_granted", "reason": null,
    "occurredAt": "2026-09-14T13:05:22-05:00" } ] }
```

`credentialId` en `null` cuando el usuario no lo creó este sistema. Es información válida, no un
error. El webhook `POST /iot/alarms` que ya existe sigue igual y nada de esto lo toca.

---

## 12. Antes de dar por buena la integración

- [ ] `GET /v1/buildings` devuelve `buildingId` = `Building._id`, y `scopes` refleja el hardware real
- [ ] `PUT` con el mismo cuerpo dos veces deja el mismo estado, no duplica
- [ ] `DELETE` sobre algo ya borrado devuelve éxito, no `404`
- [ ] `GET /v1/credentials/{id}` devuelve `404` cuando no existe
- [ ] Toda marca de tiempo sale con offset, y el gateway **acepta** offset en la entrada
- [ ] Los `employeeNo` llevan prefijo `DT4-` y **jamás** se reutilizan
- [ ] Un usuario sin prefijo `DT4-` nunca se borra, en ningún camino de código
- [ ] El inventario pagina hasta agotar; probado con un terminal de más de 50 usuarios
- [ ] `managed` distingue correctamente lo propio de lo cargado a mano
- [ ] El PIN no aparece en la base, ni en logs, ni en ninguna respuesta. **Con una prueba que lo fije**
- [ ] Los PINs que llegan del inventario ISAPI se descartan en memoria
- [ ] Los errores llevan `code` de la tabla de [§5](#5-errores-tipados-no-texto)
- [ ] `pin_conflict` se devuelve cuando el terminal rechaza por duplicado, y no se resuelve solo
- [ ] `/v1/health` distingue `gatewayOnline` de `online` por dispositivo, y hay alerta sobre el latido
- [ ] El gateway corre bajo `systemd` con `Restart=on-failure`
- [ ] Bloqueo por intentos fallidos activado y **verificado** en cada terminal
- [ ] Existe un entorno de staging que no toca puertas de edificios habitados

---

## 13. Lo que falta acordar

Nada de esto bloquea el desarrollo; es acuerdo operativo, no diseño:

- **Retención de eventos** en la VPS, y hasta qué fecha se puede consultar hacia atrás.
- **Latencia máxima comprometida** entre el `PUT` y el PIN funcionando en la puerta. Decide si el
  portal dice «tu PIN» o «tu PIN se está activando».
- **Ventana y responsable** de la migración de la base de Inglaterra y Pradera.
- **Restaurar el servicio de Inglaterra**, detenido desde el 03-09-2026. Va antes que todo lo demás.

---

## Anexo — Defectos del gestor actual, al margen de este contrato

Detectados analizando `pin-management-inglaterra`. Hay que corregirlos aunque el reparto fuera otro.

| # | Defecto | Consecuencia |
|---|---|---|
| 1 | `users.pin` y `device_users.pin_on_device` **en claro**, con `idx_users_pin` encima | Un volcado del SQLite rinde todos los PINes del edificio |
| 2 | `next_available_employee_no()` devuelve el hueco más bajo y `delete_user_assignment()` borra la fila | El número de un huésped que se fue **se reasigna al siguiente** |
| 3 | Sin prefijo que marque lo creado por el sistema | `create_user` puede **sobrescribir** a un residente cargado por iVMS-4200 |
| 4 | `get_users(max_results=50)` con `searchResultPosition: 0` fijo | Con más de 50 usuarios, cada `sync` **borra del espejo a todos los demás** |
| 5 | `create_pin_access_user()` escribe dispositivo a dispositivo sin atomicidad | Un PIN huérfano queda escrito y el siguiente `sync` **lo adopta como legítimo** |
| 6 | `idx_users_pin` no es único; `/api/duplicates` solo cuenta | Dos huéspedes con el mismo PIN es cuestión de tiempo, y nada lo evita |
| 7 | `get_expired_users()` lista, pero **nada purga** | El terminal se llena y **empieza a rechazar altas** |
| 8 | `require_local_datetime()` rechaza marcas con `tzinfo` | Ver [§6](#6-el-tiempo) |
| 9 | Sin `systemd` | El servicio dejó de existir tras un reinicio, el 03-09-2026 |

### Lo que conviene conservar

Buena parte del repositorio es exactamente lo que hace falta, y rehacerlo sería un error:

- **`hikvision/client.py`** — envoltorio ISAPI limpio, Digest, política de reintentos correcta.
  Resuelve el punto de mayor riesgo de campo.
- **`hikvision/url_builder.py`** — direccionamiento Tailscale 4via6, con pruebas.
- **Las columnas `*_on_device`** — el espejo de lo que hay realmente en el aparato. Es el insumo de
  la conciliación, y la mejor decisión de diseño del repositorio.
- **Credenciales ISAPI por variable de entorno**, con la negativa a arrancar si aparecen columnas
  heredadas.
- **Las salvaguardas del control físico** — `request_id`, confirmación explícita, bloqueo por
  resultado incierto, historial.
- **`sync_history`** — es el latido por dispositivo, con un valor que el contrato no había previsto.
