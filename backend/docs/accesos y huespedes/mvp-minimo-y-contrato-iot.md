# MVP mínimo y contrato con el servidor IoT centralizado

**DT4FM – Digital Twin for Facility Management**

Revisión del [diseño completo](README.md) bajo dos decisiones nuevas:

1. **Reducir la base de datos a lo mínimo funcional.**
2. **Un servidor central tunelado a la nube** concentra a las Raspberry de todos los edificios.

Las Raspberry siguen existiendo, una por edificio, con su LAN aislada y su cliente ISAPI. Lo que
cambia es que ya no hablan con el backend: hablan con el servidor central, y el servidor central
es la única contraparte del backend. Esa concentración es la que permite el recorte del esquema:
buena parte del modelo original existía para que el backend gestionara una flota de agentes que
ahora gestiona otro.

## Índice

1. [Qué cambia en la arquitectura](#1-qué-cambia-en-la-arquitectura)
2. [Parte 1 — Modelo de datos mínimo](#2-parte-1--modelo-de-datos-mínimo)
3. [Parte 2 — Qué necesito del servidor central](#3-parte-2--qué-necesito-del-servidor-central)
4. [Checklist para la reunión con el equipo IoT](#4-checklist-para-la-reunión-con-el-equipo-iot)

---

## 1. Qué cambia en la arquitectura

```text
ANTES (README §3)                        AHORA
─────────────────                        ─────
Backend (Render)                         Backend (Render)
     ▲  sondeo de cada agente                 │  HTTPS, una URL, un token
     │                                        ▼
Raspberry × N edificios                  Servidor central (tunelado a la nube)
     │  ISAPI en LAN                          │  túnel privado a cada edificio
     ▼                                        ▼
Terminales Hikvision                     Raspberry × N edificios
                                              │  ISAPI en LAN aislada
                                              ▼
                                         Terminales Hikvision
```

Cuatro planos, no tres. La Raspberry no desaparece: deja de ser contraparte del backend y pasa a
serlo del servidor central. Tres consecuencias directas:

* **El control lo inicia el backend.** El motivo para invertirlo —Render fuera de la VPN, sin IP
  de salida estable— desaparece: ahora el destino es un servidor con DNS público. El backend
  llama, espera respuesta y sabe el resultado en la misma petición.
* **Muere la cola de trabajos *del backend*.** `pending_write` / `claim` / `lease` / `report`
  existían para entregar órdenes a N agentes que preguntaban. Sigue habiendo agentes, pero quien
  los coordina es el servidor central; a mí me queda un estado de sincronización por credencial.
* **El backend deja de conocer los dispositivos.** Hosts, puertos, credenciales ISAPI, `door_no`
  y `employeeNo` pasan a ser problema del servidor central y de sus Pi. El backend habla de
  *edificio + ámbito*.

Lo que **no** cambia: el terminal sigue validando y abriendo sin red. Que el servidor central o
un túnel caigan no deja a nadie fuera de su casa; solo detienen altas y revocaciones. Ese sigue
siendo el modo de fallo silencioso a vigilar.

**El salto extra tiene precio.** La cadena pasa de tres eslabones a cuatro, y con ella el número
de sitios donde una escritura puede quedarse. Dos consecuencias concretas, y ambas condicionan el
contrato:

1. **«Edificio no responde» deja de ser un diagnóstico.** Puede ser el túnel caído (central ↔ Pi)
   o la LAN caída (Pi ↔ terminal). Son incidentes distintos, con responsables distintos, y
   soporte no puede actuar sin saber cuál. Por eso `GET /v1/health` debe separarlos
   ([3.3](#33-endpoints-que-necesito-consumir)).
2. **Si la Pi sondea al servidor central en vez de recibir empuje, vuelve la cola** —y con ella el
   PIN guardado en disco mientras espera. Es la única decisión que sigue abierta, y está en
   [3.6](#36-las-dos-bases-de-datos-del-lado-iot).

---

## 2. Parte 1 — Modelo de datos mínimo

**Dos tablas.** El README proponía siete.

### 2.1. Qué se elimina y por qué

| Tabla del README | Destino | Motivo |
|---|---|---|
| `access_gateway` | **Eliminada** → variables de entorno | Una tabla de una fila no es una tabla. Un solo servidor, un solo par URL + token. |
| `access_device` | **Eliminada** → servidor central | El backend nunca contacta un terminal. Host, puerto, credenciales ISAPI y `door_no` solo los usa quien habla ISAPI. Para pintar estado se consulta `GET /v1/devices` y se cachea en memoria. |
| `credential_placement` | **Eliminada** → columnas de `access_credential` | Era la cola de trabajos. Con respuesta síncrona por dispositivo, el estado agregado cabe en tres columnas. |
| `access_event` | **Eliminada** → servidor central | Es la tabla de mayor volumen y ningún flujo del MVP la lee. El servidor central ya recibe los eventos; que los sirva por consulta. |
| `guest_portal_log` | **Eliminada** → logs estructurados | `pin_viewed` y `token_rejected` se emiten como log con `stayId`; el rate limiter en memoria cubre la fuerza bruta. |
| `access_credential` | **Se queda** | Es la autoridad: no puede delegarse sin perder unicidad, cifrado y vínculo con la reserva. |
| `guest_stay` | **Se queda** | Ancla estable del token del huésped y `token_version`, que es lo único que da revocación real a un enlace autocontenido. Hostaway no tiene dónde guardarlo. |

Del lado de openMAINT se mantiene el único cambio del README: el atributo `HostawayListingId` en
la clase `Unit` ([README §5.8](README.md#58-cambio-requerido-en-openmaint)). Cuesta un atributo,
no toca el esquema del backend y de paso arregla la asignación manual de `Unit` en
`cleaning-tasks.service.ts`.

### 2.2. `access_credential`

Un registro = un permiso: un PIN, para un sujeto, en un edificio, con una ventana de validez.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` PK | no | **Viaja al servidor central** como identificador del permiso. De él deriva el `employeeNo` del terminal, así que reenviar la misma escritura es idempotente. |
| `subject_type` | `text` | no | `guest`, `tenant`, `employee`. CHECK. |
| `subject_ref` | `text` | no | `hostawayReservationId`, `Tenant._id` o `Employee._id`. Texto: los tres espacios no comparten formato. |
| `display_name` | `text` | no | Nombre al emitir. Denormalizado: la auditoría debe seguir legible si la reserva desaparece. |
| `scope` | `text` | no | `pedestrian`, `vehicular`, `both`. CHECK. |
| `building_id` | `int` | no | `Building._id` de openMAINT. Es lo que se envía al servidor central. |
| `openmaint_unit_id` | `int` | sí | `Unit._id` cuando el permiso es de un departamento. |
| `pin_ciphertext` | `text` | no | AES-256-GCM, formato `iv:tag:ciphertext` en base64url. Cifrado y no hasheado porque el portal lo muestra en cada visita. |
| `pin_fingerprint` | `text` | no | `HMAC-SHA256(clave, pin)` en hex. Unicidad y enfriamiento sin descifrar nada. |
| `valid_from` / `valid_to` | `timestamptz` | no | Vigencia. Se envían al servidor central y el terminal las hace cumplir sin red. |
| `status` | `text` | no | `pending`, `active`, `revoked`, `expired`. CHECK. Sin `purged`: sin tabla de colocaciones, la purga es `sync_state = 'synced'` sobre una credencial ya revocada o expirada. |
| `revoked_reason` | `text` | sí | `reservation_cancelled`, `dates_changed`, `manual`, `contract_ended`, `task_cancelled`. Sin esto las revocaciones son indistinguibles al investigar. |
| `issued_by` | `text` | no | `hostaway-webhook`, `cleaning-task`, `manual:<username>`. |
| `guest_stay_id` | `uuid` FK → `guest_stay` | sí | Solo si `subject_type = 'guest'`. Permite revocar en bloque. |
| `sync_state` | `text` | no | `pending`, `synced`, `failed`. Reemplaza a `credential_placement`. |
| `sync_attempts` | `int` | no | Por defecto `0`. Alcanzado el tope pasa a `failed` y deja de reintentarse solo. |
| `sync_detail` | `jsonb` | sí | Respuesta por dispositivo del servidor central: qué terminales quedaron escritos y cuáles fallaron, con su error. Sustituto barato de la tabla de colocaciones: sirve para diagnóstico, no para consultar. |
| `created_at` / `updated_at` | `timestamptz` | no | Auditoría. `updated_at` cubre el momento de la revocación. |

**Índices**

```sql
CREATE INDEX idx_credential_subject ON access_credential (subject_type, subject_ref);
CREATE INDEX idx_credential_expiry  ON access_credential (status, valid_to);
CREATE INDEX idx_credential_stay    ON access_credential (guest_stay_id);

-- Unicidad acotada: mismo edificio, mismo ámbito, al mismo tiempo.
CREATE UNIQUE INDEX uq_credential_pin_activo
  ON access_credential (building_id, scope, pin_fingerprint)
  WHERE status IN ('pending', 'active');

-- La cola de reintentos: solo lo no sincronizado.
CREATE INDEX idx_credential_sync_pendiente
  ON access_credential (sync_state, updated_at)
  WHERE sync_state <> 'synced';
```

El **enfriamiento de PINs** sobrevive sin tabla extra: las filas no se borran, así que
`pin_fingerprint` conserva el histórico y basta comprobar que ninguna credencial del mismo
edificio con esa huella tenga `valid_to` dentro de los últimos `ACCESS_PIN_COOLDOWN_DAYS` días.

### 2.3. `guest_stay`

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` PK | no | Viaja dentro del token del huésped. |
| `hostaway_reservation_id` | `text` UNIQUE | no | Clave natural y único enlace con Hostaway. |
| `listing_id` | `text` | no | `listingMapId`. Se conserva aunque la unidad ya esté resuelta, para rehacer el mapeo. |
| `openmaint_unit_id` | `int` | sí | Resuelto vía `HostawayListingId`. **Nulo es estado esperado**, no error: sin mapeo el panel no muestra departamento, pero el PIN funciona. |
| `building_id` | `int` | sí | Derivado de la unidad. Cacheado para no consultar openMAINT en cada carga. |
| `guest_name` | `text` | no | Huésped principal. |
| `guest_email` | `text` | sí | Nulo cuando el canal lo oculta (Airbnb). |
| `guest_last_name_hash` | `text` | sí | Hash del apellido normalizado. Segundo factor del canje. |
| `arrival_date` / `departure_date` | `date` | no | Según Hostaway. |
| `access_valid_from` / `access_valid_to` | `timestamptz` | no | Vigencia real con márgenes ya aplicados. Calculadas y guardadas para que credencial y panel no puedan discrepar. |
| `status` | `text` | no | `pending`, `active`, `completed`, `cancelled`. CHECK. |
| `token_version` | `int` | no | Empieza en `1`. **Incrementarlo invalida todos los enlaces emitidos.** Cancelar, cambiar fechas o reenviar un enlace comprometido son un `+1`. |
| `created_at` / `updated_at` | `timestamptz` | no | Auditoría. |

**Índices:** único en `hostaway_reservation_id`; `(status, access_valid_to)` para el barrido;
`listing_id`.

Frente al README se caen `guest_phone` (no hay canal SMS/WhatsApp en el MVP; el enlace va por
mensaje de Hostaway o correo) y `portal_opened_at` (métrica de adopción, no requisito).

### 2.4. Migración

Una sola, dos tablas, en el orden `guest_stay` → `access_credential`. Convención del repositorio:
`src/database/migrations/<timestamp>-CreateAccessControlTables.ts`, SQL en crudo por
`queryRunner.query()`, `down()` en orden inverso. Contra Neon, `DATABASE_URL_DIRECT` sin *pooler*
([neon-postgres.md](../neon-postgres.md)).

A mano, porque no salen del generador de TypeORM: el índice único parcial, los índices parciales
de sincronización y los CHECK de los campos enumerados (`text` + CHECK en vez de enum de Postgres:
añadir un valor a un enum es una migración incómoda y estos conjuntos van a crecer).

### 2.5. Variables de entorno mínimas

De trece a siete obligatorias. Desaparece `ACCESS_DEVICE_KEY` —el backend ya no custodia
contraseñas ISAPI— y todas las del modelo de sondeo.

```env
# ── Portal del huésped ─────────────────────────────────────── [OBLIGATORIAS]
GUEST_TOKEN_SECRET=            # firma del enlace; rotarla invalida los vigentes
GUEST_SESSION_SECRET=          # JWT de sesión, distinto del anterior

# ── Control de accesos ─────────────────────────────────────── [OBLIGATORIAS]
ACCESS_PIN_KEY=                # AES-256-GCM, 32 bytes en base64
ACCESS_PIN_FINGERPRINT_KEY=    # HMAC de la huella, distinta de la anterior

# ── Servidor IoT ───────────────────────────────────────────── [OBLIGATORIAS]
IOT_SERVER_URL=                # https://…, sin barra final
IOT_SERVER_TOKEN=              # Bearer que el backend presenta

# ── Ajustes con valor por defecto ──────────────────────────────────────────
ACCESS_PIN_LENGTH=4            # decisión del cliente; ver 3.5
ACCESS_PIN_COOLDOWN_DAYS=30
ACCESS_SYNC_MAX_ATTEMPTS=5     # reintentos antes de marcar sync_state = 'failed'
GUEST_ACCESS_LEAD_HOURS=3
GUEST_ACCESS_GRACE_HOURS=3
GUEST_SESSION_TTL_MINUTES=30
```

### 2.6. Endpoints del backend en el MVP

De dieciséis a siete. Todo el bloque `/gateway/*` desaparece: era la cara del sondeo, y los dos
webhooks entrantes que preveía este documento tampoco hacen falta en el MVP ([3.4](#34-el-backend-no-expone-nada-al-servidor-central)).

| Método | Ruta | Auth | Nota |
|---|---|---|---|
| `POST` | `/guest/session` | — | Canje de enlace + apellido por JWT de 30 min. Limitado por IP y estancia. |
| `GET` | `/guest/me/stay` | JWT huésped | Panel, con degradación por bloques. |
| `GET` | `/guest/me/credentials` | JWT huésped | **Único punto del código que descifra un PIN.** |
| `GET` | `/access/credentials` | Sesión openMAINT | Búsqueda. Nunca devuelve el PIN. |
| `POST` | `/access/credentials` | Sesión openMAINT | Alta manual. |
| `POST` | `/access/credentials/:id/revoke` | Sesión openMAINT | Revocación con motivo. |
| `GET` | `/access/health` | Sesión openMAINT | Proxy de la salud del servidor central + credenciales en `failed`. |

Ninguna ruta de huésped lleva `:stayId`: la identidad sale siempre de la sesión, por la razón ya
documentada en `owner-session.guard.ts`.

### 2.7. Qué se pierde, y cuándo hay que devolverlo

Recortar tiene precio. Conviene tenerlo escrito antes de que alguien lo descubra en producción.

| Se pierde | Consecuencia real | Cuándo devolverlo |
|---|---|---|
| Prueba de revocación por dispositivo | «Revocado» pasa a ser lo que afirma el servidor central, no un hecho verificable en el backend | Al primer incidente de acceso, o si auditoría lo exige |
| Auditoría de aperturas en Postgres | El histórico depende de la disponibilidad y la retención del servidor central | Cuando alguien tenga que responder «¿quién entró el martes?» sin llamar al otro equipo |
| `guest_portal_log` | «¿Quién vio este PIN?» sale de logs, con la retención del proveedor | Ante la primera disputa con un huésped |
| Conciliación nocturna | Un PIN escrito a mano en un terminal, o una escritura perdida, no se detecta desde el backend | Debe existir **en el servidor central**; ver [3.7](#37-garantías-operativas) |
| Credencial por edificio | Un solo token: comprometerlo es comprometer toda la flota | Es inherente a centralizar. Se compensa con rotación y con aislamiento del servidor central |

El recorte que **no** conviene hacer es la conciliación: no desaparece, cambia de dueño. Si el
servidor central no la hace, cada fallo de red deja un PIN activo que el backend cree revocado y nadie
se entera. Ese es el modo de fallo peligroso del módulo, con siete tablas o con dos.

---

## 3. Parte 2 — Qué necesito del servidor central

Lo que sigue es la lista de acuerdos y contratos que necesito cerrados para desarrollar el
backend. Está ordenada por lo que bloquea antes.

### 3.1. Acuerdos de identificadores — lo primero

Bloquean el esquema. Sin esto no se escribe una línea.

| Acuerdo | Por qué es crítico |
|---|---|
| **`buildingId` = `Building._id` de openMAINT** | Es la clave con la que el backend decide dónde colocar una credencial. Si el servidor central usa nombres propios (`torre-a`), hace falta una tabla de mapeo y vuelve una tabla al esquema. **Pido que adopte el `_id` de openMAINT** — el porqué, y por qué no el `Code`, en [3.1.1](#311-por-qué-el-_id-y-no-el-code). |
| **`credentialId` es mío (uuid) y ellos lo respetan** | De él deriva el `employeeNo` del terminal. Es lo que hace idempotente reenviar una escritura y preciso un borrado. |
| **Prefijo `DT4-` en `employeeNo`** | Marca lo creado por este sistema. **Nunca se borra un usuario sin ese prefijo**: los terminales tienen residentes cargados a mano y un barrido «limpiador» deja gente en la calle. |
| **`unitId` = `Unit._id`**, opcional | Solo contexto para el terminal. No debe ser obligatorio: el acceso no puede depender de que el mapeo exista. |
| **Zona horaria explícita** | Todas las marcas de tiempo en ISO 8601 **con offset**. Si el terminal interpreta `validTo` en su hora local y el backend la envía en UTC, las credenciales caducan a la hora equivocada. |

#### 3.1.1. Por qué el `_id` y no el `Code`

Se evaluó usar `Building.Code` como clave, que sería más legible. Se descarta por una razón de
esquema: **openMAINT no garantiza que `Code` sea único ni inmutable**. El propio repositorio ya
documenta lo que eso cuesta — la integración de alarmas usa `Asset.Code` y tiene que contemplar el
código duplicado, en el que el correctivo se crea sin enlazar
([openmaint-iot-alarms.md](../../../docs/integrations/openmaint-iot-alarms.md)). En alarmas eso
degrada un registro; en puertas, un código ambiguo significa escribir un PIN en el edificio
equivocado.

Se podría añadir la restricción de único e inmutable en openMAINT y usarlo. Se prefiere no
depender de ello: el `_id` ya trae esas dos garantías por construcción, sin trabajo previo, sin
auditoría de duplicados y sin confiar en que el modo del atributo se respete también por API. A
eso se suma que llega gratis: el atributo `Building` de una card `Unit` es una referencia, y una
referencia ya trae el `_id` del destino, así que resolverlo no cuesta ningún salto extra.

**El `Code` sigue siendo útil, como etiqueta.** La nomenclatura de tres letras —`BAT`, `ING`,
`PRA`, `REP`— es lo que hace legibles los logs y las pantallas de soporte. Por eso
`GET /v1/buildings` devuelve `code` y `name` junto al `buildingId`: se opera con el entero y se
lee con el código. Lo que no hace el `Code` es gobernar la unicidad del PIN ni viajar en el
cuerpo del `PUT`.

### 3.2. Conexión y autenticación

* **URL base estable con TLS y certificado válido**, una por entorno. Necesito **staging** para
  desarrollar: no voy a probar contra las puertas reales de un edificio habitado.
* **Autenticación por token `Bearer`**, no por lista blanca de IP. Render no garantiza IP de
  salida; una allowlist rompería en cada despliegue. Si exigen mTLS, necesito el certificado y
  saber que puedo montarlo desde variables de entorno.
* **Procedimiento de rotación del token** sin ventana de caída: aceptar el anterior y el nuevo
  durante un plazo.
* **Timeouts y límites**: cuánto tarda como máximo una escritura, cuántas peticiones por minuto
  aguantan, y qué devuelven al limitar (`429` + `Retry-After`).
* **Códigos de error tipados**, no solo texto: necesito distinguir «edificio sin conexión»
  (reintentar) de «PIN duplicado en el terminal» (regenerar) de «token inválido» (alertar).

### 3.3. Endpoints que necesito consumir

Cinco. Es el mínimo con el que el backend puede funcionar.

#### `GET /v1/buildings` — catálogo

Para validar que un `buildingId` existe antes de emitir, y para saber si hay ámbito vehicular en
ese edificio.

```json
[
  { "buildingId": 42, "code": "BAT", "name": "Batán", "online": true,
    "scopes": ["pedestrian", "vehicular"], "lastSeenAt": "2026-09-02T09:41:12-05:00" }
]
```

#### `GET /v1/devices` — inventario

No lo guardo en base de datos: lo cacheo en memoria con TTL, igual que hace hoy
`OwnersIdentityService`. Lo necesito para el detalle por dispositivo en `/access/health` y para
alertar de saturación antes de que un terminal rechace altas.

```json
[
  { "deviceId": "BAT-PEATONAL-1", "buildingId": 42, "kind": "terminal",
    "scope": "pedestrian", "online": true, "usersUsed": 812, "usersCapacity": 3000,
    "firmware": "V3.2.60", "clockSkewSeconds": 2, "lastSeenAt": "…" }
]
```

`usersUsed` / `usersCapacity` importan más de lo que parece: los huéspedes rotan, y si los
registros expirados no se borran el equipo se llena y **deja de aceptar altas**.

#### `PUT /v1/credentials/{credentialId}` — alta y actualización

`PUT` y no `POST` a propósito: idempotente por definición. Reenviarlo con el mismo cuerpo debe
dejar el mismo resultado, no duplicar ni fallar. Es el endpoint que uso también para cambios de
fecha, donde **el PIN no cambia** —el huésped ya lo tiene anotado— y solo se mueve la vigencia.

```json
{
  "buildingId": 42,
  "scope": "pedestrian",
  "pin": "482913",
  "validFrom": "2026-09-14T12:00:00-05:00",
  "validTo":   "2026-09-18T15:00:00-05:00",
  "displayName": "Ana Perez",
  "unitId": 1187
}
```

Respuesta que necesito, con **detalle por dispositivo**:

```json
{
  "credentialId": "3f9a…",
  "state": "written",
  "devices": [
    { "deviceId": "BAT-PEATONAL-1", "state": "written",
      "employeeNo": "DT4-G-3f9a2b11", "at": "2026-09-02T09:41:13-05:00" },
    { "deviceId": "BAT-LOBBY", "state": "unreachable", "error": "link down" }
  ]
}
```

`state` agregado con cuatro valores: `written` (en todos), `partial` (en algunos),
`unreachable` (edificio sin conexión) y `failed`. Mapea directo a mi `sync_state`, y el arreglo
`devices` va tal cual a `sync_detail`. **`partial` no es un error**: un huésped con el PIN escrito
en el portal peatonal pero no en la barrera puede entrar a pie, y el panel debe poder decirlo.

**`unreachable` significa que devuelven el fallo, no que encolan.** Pido explícitamente que el
servidor central **no retenga la petición**: si el edificio no responde, contesta y olvida. Quien
reintenta soy yo, con la credencial que ya tengo en `sync_state = 'pending'`. El motivo es de
seguridad y está en [3.6](#36-las-dos-bases-de-datos-del-lado-iot): encolar obliga a guardar el PIN
en su disco, que es justo lo que no queremos.

#### `DELETE /v1/credentials/{credentialId}` — revocación

Misma forma de respuesta. **Debe ser idempotente**: borrar algo ya borrado devuelve éxito, no
`404`. Es la operación crítica del módulo y la que no puede quedarse a medias en silencio.

#### `GET /v1/credentials/{credentialId}` — estado real

Lo que el servidor central ve **hoy en el dispositivo**, no lo que cree recordar. Lo uso para
verificar antes de responder a una consulta de soporte y para reconciliar diferencias.

#### `GET /v1/health` — salud

**Debe separar los dos eslabones**: el túnel al edificio y la LAN dentro de él. Con cuatro planos,
un `online: false` a secas no dice a quién llamar.

```json
{ "buildings": [
  { "buildingId": 42,
    "gatewayOnline": true,                    // túnel central ↔ Raspberry
    "gatewayLastSeenAt": "2026-09-02T09:41:12-05:00",
    "gatewayVersion": "1.4.2",
    "pendingJobs": 0, "failedJobs": 1, "maxClockSkewSeconds": 3,
    "devices": [                              // LAN Raspberry ↔ terminal
      { "deviceId": "BAT-PEATONAL-1", "online": true },
      { "deviceId": "BAT-LOBBY", "online": false, "lastSeenAt": "…" }
    ] } ] }
```

Es la pantalla que hay que mirar a diario. Un edificio incomunicado **no produce errores
visibles**: las puertas siguen abriendo con lo ya sincronizado, pero altas y revocaciones dejan de
aplicarse en silencio. `gatewayLastSeenAt` es el latido del [README §5.1](README.md#51-access_gateway--la-raspberry-de-cada-edificio),
solo que ahora lo vigila el servidor central y yo lo leo de aquí. Debe existir una alerta sobre
ese campo.

#### `GET /v1/events?from=&to=&cursor=` — opcional en el MVP

Solo si prefieren que el backend consulte en vez de empujar ellos. Necesito paginación por cursor
y saber **cuánto histórico conservan**.

### 3.4. El backend no expone nada al servidor central

En el MVP, **ninguno**. La conversación es de una sola dirección: el backend llama, el servidor
IoT responde. Es la consecuencia de las dos decisiones anteriores.

* **Sin encolado no hay callback.** El resultado de una escritura llega en la respuesta del
  `PUT`. Lo que sale `unreachable` lo reintenta mi barrido sobre `sync_state <> 'synced'`, que ya
  existe por el índice parcial de [2.2](#22-access_credential). Un webhook de retorno solo haría
  falta si retuvieran la petición, y precisamente pido que no lo hagan.
* **Sin `access_event` no hay webhook de eventos.** Si no guardo aperturas en Postgres, no tengo
  dónde recibirlas. La auditoría se sirve consultando `GET /v1/events` cuando alguien abre la
  pantalla, no ingiriendo un flujo continuo que iría a parar a ningún sitio.

**¿Empujar o consultar, entonces?** Consultar, y por una razón concreta: **empujar solo tiene
sentido si hay dónde guardar**. Un webhook que recibe eventos para descartarlos es infraestructura
sin destinatario, y encima paga el peor rasgo del despliegue actual —el propio repositorio
documenta que *«Render duerme y reinicia la instancia»* (`reset-token.service.ts`)—: un evento
empujado a una instancia dormida se pierde o llega tarde, y sin `dedupe_key` en base de datos no
hay forma de saber cuál faltó.

El día que vuelva `access_event` —y volverá, ver [2.7](#27-qué-se-pierde-y-cuándo-hay-que-devolverlo)—
la respuesta se invierte y hacen falta **las dos vías**: empuje para la latencia y consulta
periódica por rango para rellenar lo que el empuje pierda en cada reinicio. Solo con empuje se
pierden eventos sin enterarse; solo con consulta, la latencia sube a minutos. Conviene dejarlo
pactado ahora aunque se implemente después, para no renegociar el contrato entero por un webhook.

Cuando llegue, se implementa con el patrón del `IotWebhookGuard` que ya existe —secreto compartido
en cabecera, `timingSafeEqual`, `503` si no está configurado— y con esta forma:

```json
{ "events": [
  { "eventId": "BAT-PEATONAL-1:88123", "deviceId": "BAT-PEATONAL-1",
    "buildingId": 42, "credentialId": "3f9a…", "employeeNo": "DT4-G-3f9a2b11",
    "eventType": "access_granted", "reason": null,
    "occurredAt": "2026-09-14T13:05:22-05:00" } ] }
```

Idempotente por `eventId`: la entrega es *al menos una vez* y tras un corte se reenvía.
`credentialId` en `null` cuando el usuario no lo creó este sistema —un residente cargado a mano—:
es información válida, no un error.

El webhook existente `POST /iot/alarms` sigue igual y no lo toca nada de esto.

### 3.5. Hechos del hardware, ya confirmados

Las preguntas que este documento dejaba abiertas están respondidas. Quedan aquí porque cada una
cierra —o abre— una parte del diseño.

| Hecho | Qué resuelve |
|---|---|
| **El terminal aplica la vigencia por sí mismo** (`beginTime`/`endTime`) | La respuesta que más importaba, y salió bien. La caducidad es **un dato, no una operación**: se escribe una vez y la puerta sigue siendo correcta sin red, sin túnel y sin servidor central. La purga pasa a ser higiene de capacidad, no un mecanismo de seguridad con hora crítica. |
| **No se usa ANPR** | No hay lista de placas, no hay variante de `access_credential` con `plate` y `POST /guest/me/vehicle` sale del alcance. El acceso vehicular, si lo hay, es por teclado y entra en el mismo modelo con `scope = 'vehicular'`. |
| **Todas las puertas en modo PIN solo** | El PIN por sí solo abre. El portal puede prometer exactamente lo que muestra, sin tarjeta de por medio. |
| **PIN de 4 dígitos** | Decisión del cliente. Fija `ACCESS_PIN_LENGTH=4`, con las consecuencias de abajo. |
| El equipo IoT acepta el contrato de [3.3](#33-endpoints-que-necesito-consumir) | Cinco endpoints, `PUT` idempotente, respuesta con detalle por dispositivo. |

Sigue pendiente de comprobar contra el equipo real —**ISAPI varía de forma significativa entre
familias de producto y versiones de firmware**— si el terminal exige PIN único entre sus usuarios
y cuál es su tope de usuarios. Ninguna de las dos bloquea el esquema, pero la primera decide si mi
índice único parcial basta o hay que contrastar además contra el inventario del dispositivo.

#### Lo que cuesta el PIN de 4 dígitos

Cuatro dígitos son **10 000 combinaciones**, y con puertas en modo PIN solo eso es tecleable. No
es un motivo para reabrir la decisión, pero sí para exigir tres cosas que con seis dígitos eran
opcionales:

1. **Bloqueo por intentos fallidos en el terminal.** Es la mitigación que sustituye a la longitud,
   y es del lado del hardware, no mío. Sin ella, 10 000 combinaciones se agotan en una tarde
   frente a la puerta. **Hay que confirmar que el modelo lo soporta y dejarlo activado en el
   aprovisionamiento de cada dispositivo.**
2. **Rechazo de PINs débiles, más estricto que con seis dígitos.** Fuera `0000`, `1234`, `1111` y
   las demás repeticiones, las escaleras, y los años `19xx` y `20xx` —que un huésped teclea por
   instinto y un atacante prueba primero. Excluirlos cuesta menos del 5 % del espacio.
3. **`access_event` deja de ser prescindible antes de lo previsto.** Una ráfaga de
   `access_denied` sobre la misma puerta es la señal de un ataque por fuerza bruta, y hoy esa
   señal vive solo en el servidor central. Mientras no vuelva la tabla, la detección es suya:
   conviene pactar que alerten.

El **enfriamiento sí aguanta**: un edificio de 40 unidades con rotación de cuatro días emite unos
300 PINs de huésped al mes, un 3 % del espacio. Con `ACCESS_PIN_COOLDOWN_DAYS=30` el generador
sigue encontrando hueco sin esfuerzo. El riesgo del PIN corto es la fuerza bruta, no el
agotamiento.

### 3.6. Las dos bases de datos del lado IoT

Con cuatro planos hay dos almacenes nuevos, y conviene fijar qué guarda cada uno —sobre todo, qué
**no**.

#### El servidor central

Cuatro tablas. Es, en buena medida, lo que salió del esquema del backend:

| Tabla | Qué guarda | Origen |
|---|---|---|
| Edificios / gateways | Un registro por Raspberry: credencial propia, `buildingId`, latido, versión del agente | Era `access_gateway` |
| Dispositivos | Host, puerto, `door_no`, credenciales ISAPI **cifradas**, capacidad, firmware | Era `access_device` |
| Colocaciones | `credentialId` ↔ `deviceId` ↔ `employeeNo`, con su estado | Era `credential_placement` |
| Eventos | Aperturas con su clave de deduplicación | Era `access_event` |

La tercera es la importante: **`credential_placement` no desapareció, cambió de dueño.** Es lo
único que permite borrar con precisión y conciliar, y sin ella la revocación vuelve a ser un acto
de fe. Que yo la haya quitado de mi lado no significa que nadie deba tenerla.

#### La Raspberry

Igual que en el [README §10](README.md#10-el-agente-de-la-raspberry), y por las mismas razones:
**buffer de eventos** sin enviar y **bitácora de trabajos** recientes para diagnóstico local. Nada
más. El buffer es lo único irrecuperable si se pierde, porque el terminal acaba rotando su
histórico.

#### Ninguna de las dos guarda PINs — con una condición

El PIN llega, se escribe en el terminal y se descarta. Nunca toca el disco de la Pi ni sus logs.
Eso se sostiene **si el servidor central puede empujar a la Raspberry en el momento**, que es lo
que un túnel persistente permite.

> **Decisión abierta, la única que queda.** ¿El túnel deja al servidor central llamar a la Pi
> cuando quiera, o es la Pi la que sondea al central?
>
> * **Túnel persistente** (WireGuard, túnel inverso, websocket): el central relaya mi `PUT` en el
>   momento, contesta con el resultado real y **ningún PIN se guarda en ningún sitio**. Es el
>   contrato descrito en este documento y la opción recomendada.
> * **La Pi sondea:** el central tiene que **retener mi escritura** hasta que la Pi pregunte. Eso
>   reintroduce la cola de trabajos y, con ella, el PIN en su disco. Si es el caso, hacen falta
>   tres cosas: cifrarlo en reposo, borrarlo en cuanto la Pi confirme, y devolverme el estado
>   `queued` más un callback `POST /iot/credentials/callback` —que este documento había
>   eliminado— para que la credencial no se quede en `pending` hasta que la descubra un barrido.
>
> La diferencia no es de rendimiento sino de superficie: en la primera opción el PIN existe
> cifrado en un solo sitio; en la segunda, en dos.

### 3.7. Garantías operativas

Compromisos, no endpoints. Los necesito por escrito porque determinan qué puede prometer el panel.

* **Latencia de escritura.** Cuánto pasa entre mi `PUT` y el PIN funcionando en la puerta. Decide
  si el panel dice «tu PIN» o «tu PIN se está activando», y con cuánta antelación al check-in hay
  que emitir.
* **Comportamiento con un eslabón caído**, distinguiendo cuál. Si el túnel al edificio está
  abajo, ¿retienen la escritura o me la devuelven? Si es la LAN entre la Pi y un terminal, ¿lo
  reporta la Pi como `unreachable` de ese dispositivo, o como fallo del edificio entero? Lo
  primero es un `partial` y el huésped puede entrar por otra puerta; lo segundo no.
* **Bloqueo por intentos fallidos activado en cada terminal.** Con PIN de 4 dígitos es la
  mitigación principal, y está en su lado ([3.5](#35-hechos-del-hardware-ya-confirmados)).
  Necesito confirmación de que el modelo lo soporta y de que queda activo en el aprovisionamiento.
* **Conciliación periódica contra el inventario real del terminal**, con las cuatro reglas del
  [README §12.1](README.md#121-conciliación) —y muy en especial: *un usuario sin prefijo `DT4-` se
  reporta y no se toca*. Necesito ver sus discrepancias, por endpoint o por callback.
* **Purga de credenciales vencidas.** Si solo expira la ventana sin borrar el registro, el hueco
  sigue ocupado y el terminal se llena. No es higiene opcional, es requisito funcional.
* **Retención de eventos** y hasta qué fecha puedo consultar hacia atrás.
* **Canal de escalamiento y ventanas de mantenimiento.** Una actualización de firmware puede
  alterar ISAPI y romper la integración sin previo aviso.

### 3.8. Seguridad

* **El PIN sale del backend en un solo punto: el cuerpo del `PUT`.** Va sobre TLS a un servidor
  autenticado. Necesito su compromiso de **no persistirlo ni registrarlo en logs**: lo usan para
  escribir en el terminal y lo descartan.
* **Las credenciales ISAPI son suyas**, distintas por dispositivo. Una compartida convierte un
  equipo comprometido en toda la flota.
* **Los terminales, en VLAN aislada**, nunca expuestos a internet ni por reenvío de puertos ni por
  UPnP. Estos equipos arrastran un historial serio de vulnerabilidades explotadas de forma masiva,
  y la VPN ayuda pero no sustituye el aislamiento.
* **Centralizar concentra el riesgo.** Antes, una Raspberry comprometida era un edificio. Ahora el
  servidor central es la flota entera. A cambio hay un solo sitio que endurecer, parchear y auditar,
  en vez de N cajas en cuartos técnicos. Es una decisión defendible, pero hay que asumirla
  explícitamente y no descubrirla después.

---

## 4. Checklist para la reunión con el equipo IoT

### Ya resuelto

| Pregunta | Respuesta |
|---|---|
| ¿El terminal aplica la vigencia por sí mismo? | **Sí.** La caducidad es un dato, no una operación. |
| ¿La entrada vehicular es ANPR? | **No.** Sin lista de placas; fuera `POST /guest/me/vehicle`. |
| ¿Modo de autenticación de cada puerta? | **PIN solo.** El PIN por sí solo abre. |
| ¿Longitud del PIN? | **4 dígitos.** Con las tres exigencias de [3.5](#35-hechos-del-hardware-ya-confirmados). |
| ¿Aceptan el contrato de endpoints? | **Sí.** Cinco endpoints, `PUT` idempotente, detalle por dispositivo. |
| ¿Empujar eventos o consultarlos? | **Consultarlos**, mientras no exista `access_event` ([3.4](#34-el-backend-no-expone-nada-al-servidor-central)). |

### Bloquea el desarrollo

1. **¿El túnel es persistente o la Pi sondea?** Decide si el `PUT` sigue siendo síncrono o si
   vuelven la cola, el estado `queued`, el callback y el PIN en disco ([3.6](#36-las-dos-bases-de-datos-del-lado-iot)).
2. **¿`buildingId` será el `Building._id` de openMAINT?** Si no, hay tabla de mapeo y el esquema
   deja de ser de dos tablas. Los códigos de tres letras (`BAT`, `ING`, `PRA`, `REP`) viajan como
   etiqueta, no como clave.
3. **URL de staging y token.** Sin esto no se puede desarrollar contra nada.

### Queda por confirmar

4. ¿Bloquea el terminal tras N intentos fallidos? Con PIN de 4 dígitos es la mitigación principal.
5. ¿Exige el terminal PIN único entre sus usuarios? Y su tope de usuarios por modelo.
6. Latencia esperada de una escritura, y comportamiento con el túnel o la LAN caídos.
7. Quién hace la conciliación y la purga, y cómo veo yo sus resultados.
8. Retención de eventos en el servidor central: hasta qué fecha puedo consultar hacia atrás.

---

## Referencias

* [Diseño completo de accesos y portal del huésped](README.md) — modelo de siete tablas y agente por edificio
* [Alarmas IoT → correctivo](../../../docs/integrations/openmaint-iot-alarms.md) — contrato vigente con el servidor IoT
* [Módulo de limpieza](../limpieza%20modulo/limpieza-modulo.md) — `CleaningTask`, origen de las credenciales de personal
* [Recuperación de contraseña](../password%20recovery%20module/password-recovery-module.md) — patrón del token firmado
* [Neon Postgres](../neon-postgres.md) — ejecución de migraciones
