# Análisis del servidor de accesos existente

**DT4FM – Digital Twin for Facility Management**

Revisión del repositorio `pin-management-inglaterra` («Access Manager»), commit `ed0835f`, ~3.800
líneas de Python, contrastada con la **Guía técnica del repositorio** que emitió Construiblec ·
Ingeniería IoT el 04-09-2026. Objetivo: entender qué decisiones de arquitectura toma, qué
implementa de verdad, y decidir **dónde debe vivir la gestión de pines**.

> **Encuadre, corregido tras leer la guía.** Este repositorio **no es el servidor central**: es el
> futuro **gateway de un edificio**. El servidor central —la «VPS central» de su plan— todavía no
> existe. Ver [1.1](#11-el-destino-que-ya-tienen-planificado); condiciona la lectura de todo lo
> demás.

Documentos relacionados: [MVP mínimo y contrato](mvp-minimo-y-contrato-iot.md) ·
[diseño completo](README.md)

## Índice

1. [Qué es hoy, y qué va a ser](#1-qué-es-hoy-y-qué-va-a-ser)
2. [Decisiones de arquitectura](#2-decisiones-de-arquitectura)
3. [Modelo de datos](#3-modelo-de-datos)
4. [La pregunta: ¿quién gestiona los pines?](#4-la-pregunta-quién-gestiona-los-pines)
5. [Incompatibilidades con el contrato](#5-incompatibilidades-con-el-contrato)
6. [Defectos que hay que corregir de todos modos](#6-defectos-que-hay-que-corregir-de-todos-modos)
7. [Lo que hay que conservar](#7-lo-que-hay-que-conservar)
8. [Plan de convergencia](#8-plan-de-convergencia)

---

## 1. Qué es hoy, y qué va a ser

**Una consola de operación local para un edificio.** No es un servicio: es una aplicación con
frontend propio (HTML/JS sin framework), servida por un `ThreadingHTTPServer` de la librería
estándar, que escucha en `127.0.0.1:8080` y habla ISAPI con los terminales Hikvision de Inglaterra
a través de Tailscale 4via6.

```text
Navegador del operador
        │  Bearer en memoria, Origin exigido
        ▼
ThreadingHTTPServer  ──►  SQLite (buildings, devices, users, device_users)
        │
        ▼  Digest sobre HTTP
Tailscale 4via6  ──►  Terminales Hikvision
```

Lo que sabe hacer, verificado sobre el código:

| Capacidad | Dónde | Estado |
|---|---|---|
| Alta de usuario con PIN y vigencia en varios dispositivos | `user_service.create_pin_access_user()` | Completo |
| Modificación y borrado por dispositivo | `update_user_assignment()`, `delete_user_assignment()` | Completo |
| Lectura del inventario real del terminal | `sync_service.sync_all_devices()` | Funciona, con un límite grave — ver [6.3](#63-la-sincronización-trunca-a-50-usuarios) |
| Apertura remota de barrera vehicular | `remote_operation_service` | Completo, con salvaguardas serias |
| Reporte de PINs y nombres duplicados | `report_service` | Solo informa; no impide |
| Historial de sincronizaciones | `sync_history` | Completo |
| **Eventos de apertura** | — | **No existe.** Nada lee `AcsEvent` |
| **Caducidad y purga** | `get_expired_users()` | Solo lista; no borra del terminal |
| Vínculo con reservas, unidades o personas | — | **No existe.** Cero referencias a Hostaway u openMAINT |

Superficie HTTP actual: once `GET` y seis `POST`, todos bajo `/api/`, pensados para el frontend
propio y no para otro servidor.

### 1.1. El destino que ya tienen planificado

La guía técnica de Ingeniería IoT describe en su §11 la arquitectura acordada, y **coincide en la
forma con la recomendación de este documento**: una autoridad central y un ejecutor por edificio.

| Componente | Responsabilidad futura, según la guía |
|---|---|
| **VPS central** | Usuarios, reglas, base, auditoría, interfaz y orquestación |
| **Cloudflare Tunnel** | Entrada HTTPS sin abrir puertos en la VPS |
| **Cloudflare Access** | Identidad y políticas del personal |
| **Gateway Inglaterra / Pradera** | Conector local; *«las credenciales permanecen en el sitio»* |
| **Tailscale** | Canal administrativo y **contingencia**, ya no camino principal |
| **Portal huéspedes** | Aplicación y hostname separados |

De ahí sale el encuadre correcto: **este repositorio es el futuro gateway**, no el servidor
central. Eso cambia a qué componente corresponde cada hallazgo — ver [5](#5-incompatibilidades-con-el-contrato)
— y hace que el reparto de autoridad de [4](#4-la-pregunta-quién-gestiona-los-pines) sea una
conversación con la VPS que aún no existe, no con esta aplicación.

### 1.2. Estado real, y no es el que parece

Tres hechos de la guía que condicionan cualquier plan:

* **La producción está detenida.** Un reinicio de la Raspberry el 03-09-2026 terminó el proceso y
  *«no existía systemd, cron, tmux, screen ni otro mecanismo de persistencia»*. La base quedó
  legible (`PRAGMA quick_check = ok`). **Hoy no hay servicio corriendo en Inglaterra.**
* **El repositorio no es lo desplegado.** Es una copia sanitizada y endurecida, marcada *«NO
  APROBADO PARA DESPLIEGUE EN PRODUCCIÓN»*, que no debe confundirse con un paquete listo para
  reemplazar lo que operaba en la Raspberry.
* **Hay dos edificios, no uno.** La guía habla de conservar los historiales de **Inglaterra y
  Pradera**, y su backlog incluye *«preparar el repositorio equivalente de Pradera»*.

Ese último punto merece una objeción. **Un repositorio por edificio no escala**: con cuatro
edificios son cuatro copias del mismo código divergiendo, y contradice la consolidación que
persigue su propia §11. Con solo dos, todavía es barato replantearlo como un despliegue
parametrizado por configuración — que es justo lo que `config/buildings.json` ya permite.

---

## 2. Decisiones de arquitectura

Algunas están escritas en `docs/architecture.md`; otras solo están en el código y son las que más
importan, porque nadie las declaró.

### 2.1. Explícitas y bien tomadas

* **Tailscale 4via6 en vez de una Raspberry con agente.** `hikvision/url_builder.py` construye la
  dirección IPv6 virtual a partir de la IP local del terminal y el `via_id` del sitio. Consecuencia
  de peso: **el servidor central habla ISAPI directamente con el terminal.** La Raspberry de cada
  edificio es un *subnet router* pasivo, no un agente que sondea.

  Esto responde la decisión que quedaba abierta en el contrato, **para el diseño de hoy**: el túnel
  es persistente, el `PUT` puede ser síncrono, y ningún PIN necesita esperar encolado en disco.

  > **Pero se reabre un nivel más abajo.** La guía relega Tailscale a *«canal administrativo y
  > contingencia»* y reintroduce un gateway por edificio. Si el tramo VPS → gateway es síncrono, la
  > conclusión aguanta; si el gateway sondea, vuelven la cola y el PIN en reposo. Está sin definir,
  > y es exactamente el ítem *«Diseñar API segura entre VPS y gateways»* de su backlog. **Hay que
  > pedir que se resuelva síncrono.**

* **Credenciales ISAPI por referencia a variable de entorno.** La configuración guarda
  `username_env` / `password_env`, nunca el secreto; `schema_migrations` **se niega a arrancar** si
  encuentra columnas heredadas `username`/`password` en `devices`. Es mejor que el diseño original
  del backend, que contemplaba `isapi_password_enc` cifrado en Postgres. Conviene adoptarlo.

* **Las mutaciones no se reintentan.** `HikvisionClient._build_session()` limita los reintentos a
  `allowed_methods=frozenset({"GET"})`, con el comentario correcto: *«Commands that change physical
  or device state must never be replayed»*. Coincide exactamente con lo que pide el contrato.

* **Feature flags separados y apagados por defecto.** `WRITES_ENABLED` y
  `PHYSICAL_CONTROL_ENABLED` son independientes; el bind no local exige doble opt-in y token. La
  apertura de barrera exige `request_id`, `expected_action` y `confirm_physical_control: true`. Es
  trabajo cuidadoso.

### 2.2. Implícitas, y son las que chocan

* **El dispositivo es la fuente de verdad.** `sync_service` lee el terminal y **reemplaza** el
  espejo local: `DELETE FROM device_users WHERE device_id = ?` seguido de insertar lo leído. No
  existe ninguna operación que empuje la intención hacia el aparato cuando difieren.

  Es la decisión más importante del repositorio, y es **la opuesta a la del backend**, donde
  Postgres es la autoridad y la conciliación reescribe el dispositivo. Las dos no pueden convivir:
  o el terminal manda, o manda la base.

* **Un usuario es un PIN, no una persona.** `users` guarda `employee_no`, `name`, `pin`, vigencia.
  No hay sujeto, ni origen, ni motivo, ni estado. No se puede responder «¿de quién es este PIN?»
  ni «¿por qué se revocó?», porque el dato no existe.

* **Un solo edificio.** `_create_pin_user` usa `self.server.config.buildings[0].name` y
  `_get_runtime_status` hace `ORDER BY id LIMIT 1`. El esquema admite varios edificios; la API, no.

* **Sin identidad del llamante.** Un único `ACCESS_MANAGER_AUTH_TOKEN` compartido. La propia
  `docs/security-review.md` lo reconoce: *«El token compartido en memoria no aporta identidad
  individual, roles ni revocación de sesión»*.

* **La API está diseñada para un navegador.** Todo `POST` exige una cabecera `Origin` que coincida
  exactamente con `ACCESS_MANAGER_ALLOWED_ORIGIN`. Es una defensa CSRF correcta para el frontend
  propio y un estorbo para un llamante servidor-a-servidor, que tendría que fingir un `Origin` de
  navegador.

---

## 3. Modelo de datos

Cuatro tablas operativas más dos de historial.

```text
buildings ──1..n── devices ──1..n── device_users ──n..1── users
                                     (espejo del aparato)   (intención)
```

`users` es la intención; `device_users` es **lo que se leyó del aparato**, con las columnas
`employee_no_on_device`, `name_on_device`, `pin_on_device`, `valid_from_on_device`,
`valid_to_on_device`. Esa separación entre intención y realidad observada es **la mejor idea del
repositorio**: es exactamente el insumo de conciliación que el contrato pide en
`GET /v1/credentials/{id}`.

Equivalencias con el diseño del backend:

| Aquí | En el diseño del backend | Nota |
|---|---|---|
| `buildings` | `access_gateway` | Sin `_id` de openMAINT; se identifica por `name` y un autoincremental local |
| `devices` | `access_device` | Más completo: `url_virtual`, `ipv6_virtual`, `remote_door_id` |
| `users` | `access_credential` | **Mucho más pobre**: sin sujeto, estado, motivo, origen ni cifrado |
| `device_users` | `credential_placement` | **Más rico**: añade el espejo real del aparato |
| — | `access_event` | No existe |
| `sync_history`, `remote_operation_history` | — | No tienen equivalente; son buenos |

### Lo que el modelo no puede expresar

`access_credential` tiene quince columnas que aquí no existen y que no son adorno: `subject_type`,
`subject_ref`, `status`, `revoked_reason`, `issued_by`, `guest_stay_id`, `pin_fingerprint`,
`pin_ciphertext`. Sin ellas no hay ciclo de vida, ni auditoría, ni forma de revocar en bloque las
credenciales de una reserva cancelada.

### El PIN

Está **en claro en SQLite, y por duplicado**: `users.pin` y `device_users.pin_on_device`. Hay
además un índice sobre él, `idx_users_pin`, **no único**. La API nunca lo devuelve —los listados
exponen `pin_configured` como booleano y los duplicados se enmascaran como `****`—, lo cual está
bien resuelto, pero el dato en reposo no está protegido. `docs/architecture.md` lo admite: *«PINes
siguen siendo datos operativos sensibles dentro de SQLite y la base debe protegerse por permisos,
respaldo cifrado y acceso mínimo»*.

---

## 4. La pregunta: ¿quién gestiona los pines?

### Recomendación: la gestión va al backend; el lado IoT ejecuta

No por calidad del código —que es cuidadoso— sino porque **la gestión de pines no es un problema
de dispositivos, es un problema de negocio**, y todos los hechos que la gobiernan viven del lado
del backend.

> **La contraparte no es esta aplicación.** Leído el plan de la guía, el reparto no se negocia con
> el gateway de Inglaterra sino con la **VPS central** que van a construir, porque es a ella a
> quien su §11 le asigna *«usuarios, reglas, base, auditoría»*. Eso es, palabra por palabra,
> `access_credential`. Ver [más abajo](#el-choque-de-alcance-que-la-guía-no-ve).

### El argumento

Un PIN de huésped nace de una reserva de Hostaway, vale entre el check-in y el check-out con sus
márgenes, se revoca si la reserva se cancela, se reprograma si cambian las fechas, y se muestra en
un portal al que se entra con un enlace firmado. Un PIN de limpieza nace de una `CleaningTask` de
openMAINT y muere cuando la tarea se completa. **Ninguno de esos hechos llega nunca al servidor de
accesos**, y no hay forma barata de que lleguen: habría que darle acceso a Hostaway, a openMAINT y
al ciclo de reservas.

Mantener la gestión allí significaría construir dentro de ese repositorio, sobre SQLite y sin
migraciones, lo que el backend ya va a tener: sujeto y vínculo con la reserva, máquina de estados,
motivo de revocación, unicidad y enfriamiento del PIN, rechazo de PINs débiles, cifrado en reposo,
y auditoría por persona. Y aun así el portal del huésped tendría que leer el PIN a través del
backend, que quedaría de proxy — con lo cual el PIN viajaría igual, pero la autoridad estaría
partida en dos.

Al revés, el reparto sale limpio, porque **cada lado se queda con lo que ya hace bien**:

| El backend decide | El servidor de accesos ejecuta |
|---|---|
| Quién, por qué y hasta cuándo | Cómo llegar al aparato |
| Genera el PIN, garantiza unicidad y enfriamiento | Lo escribe por ISAPI |
| Lo cifra y lo muestra a su dueño | Lo usa y lo descarta |
| Máquina de estados y motivo de revocación | Informa el resultado por dispositivo |
| Vínculo con reserva, unidad, empleado | Inventario, túnel, credenciales ISAPI |
| Conciliación contra lo reportado | **Reporta lo que hay de verdad en el aparato** |

### El argumento decisivo: hay dos autoridades y solo puede haber una

El servidor de accesos asume hoy que **el terminal manda**: `sync` lee el aparato y sobrescribe la
base. El backend asume que **Postgres manda**: la conciliación detecta la diferencia y reescribe el
aparato.

Si se dejan las dos, el resultado no es ambiguo, es peligroso. Un borrado que falla deja un PIN
vivo en el terminal; el siguiente `sync` lo **reimporta como usuario legítimo** y la base deja de
verlo como basura. El PIN revocado sigue abriendo la puerta, y ya nadie lo sabe. Ese es el modo de
fallo que el diseño original identificó como el peligroso del módulo, y aquí está en el código.

Cambiar el sentido de la conciliación —de «el aparato manda» a «el aparato informa»— es la
decisión de fondo. Todo lo demás se deriva.

### El choque de alcance que la guía no ve

Los dos proyectos están planificando **lo mismo, dos veces**:

| Pieza | Plan del backend DT4FM | Plan de Ingeniería IoT (§11 y §2 de su guía) |
|---|---|---|
| Autoridad de credenciales | `access_credential` en Postgres | VPS central: *«usuarios, reglas, base, auditoría»* |
| Portal del huésped | Módulo `guest-portal`, token firmado, sin cuenta | *«Portal huéspedes: aplicación/hostname separado»* |
| Auditoría | `access_event` (aplazada, no cancelada) | *«Toda acción física genera auditoría, correlación y resultado explícito»* |

No es un problema técnico, es de alcance, y cuanto más tarde se hable más caro sale. La salida
limpia son **tres capas, no dos**:

```text
Backend DT4FM        autoridad de negocio
                     reserva, huésped, empleado, ciclo de vida, PIN, portal
        │  contrato backend ↔ VPS  (este documento y el MVP)
        ▼
VPS central          autoridad de dispositivos
                     qué terminal, qué employeeNo, inventario, conciliación
        │  contrato VPS ↔ gateway  (su backlog)
        ▼
Gateway por edificio  ejecución ISAPI, credenciales locales
        ▼
Terminales Hikvision
```

Funciona **si la VPS no duplica el ciclo de vida de la credencial**. La frontera hay que fijarla
antes de que escriban su tabla `users`: su propio checklist ya exige *«diseñar contrato
VPS-gateway antes de reestructurar ambos proyectos»*, y falta el otro contrato — el de arriba,
backend ↔ VPS, que es el que este documento y el [MVP](mvp-minimo-y-contrato-iot.md) describen.

Sobre el portal del huésped conviene ser explícito cuanto antes: el del backend está diseñado
sobre `guest_stay`, el token firmado de Hostaway y el enlace sin cuenta. Duplicarlo del lado IoT
significaría replicar allí las reservas. **Ese componente debería salir del alcance de la VPS.**

### Lo que no cambia

El servidor de accesos **conserva su frontend y su operación manual**. Es la salida de emergencia
cuando el backend no está disponible, y para eso tiene que seguir existiendo. Lo que sí exige es
disciplina de espacio de nombres: lo que cree el backend debe distinguirse de lo que cree un
operador a mano, o la conciliación no puede saber qué es basura y qué es un residente cargado por
alguien. Ver [6.2](#62-employee_no-se-recicla-y-no-tiene-prefijo).

---

## 5. Incompatibilidades con el contrato

Ordenadas por lo que bloquea antes. Ninguna es de diseño irreconciliable; todas exigen trabajo.

> **A quién le toca cada una.** El contrato del [MVP](mvp-minimo-y-contrato-iot.md) es
> backend ↔ **VPS central**, y este repositorio es el **gateway**. Así que algunas de estas brechas
> no son defectos suyos sino requisitos de la VPS que aún no existe:
>
> | Brecha | ¿De quién? |
> |---|---|
> | Marcas de tiempo sin zona horaria | **De ambos.** El formato atraviesa las tres capas |
> | Sin identificador del llamante | **De ambos.** La VPS lo recibe del backend y debe propagarlo |
> | API pensada para navegador | De la VPS, que nace con superficie máquina |
> | Sin eventos de apertura | **Del gateway.** Es quien alcanza el terminal |
> | Un solo edificio | **No es defecto**: un gateway *debe* ser de un edificio |
> | Faltan los cinco endpoints | De la VPS |
>
> Lo que sigue describe el estado del código; la columna de arriba dice dónde se corrige.

### 5.1. Las marcas de tiempo no admiten zona horaria

`core/validation.py`:

```python
if parsed.tzinfo is not None:
    raise ValueError(f"{field_name} must not include a timezone offset.")
```

Y `HikvisionClient._serialize_user` envía `"timeType": "local"`. El sistema entero es de **hora
local ingenua**, mientras el contrato exige ISO 8601 **con offset** — precisamente para que la
vigencia no dependa de en qué huso cree estar cada eslabón.

No es una preferencia de formato: con hora ingenua, un cambio de horario o un servidor con otro
`TZ` desplaza las vigencias sin avisar. Hay que decidir si el backend envía hora local del edificio
(y se asume el riesgo) o si el servidor de accesos acepta offsets y convierte al escribir. **Lo
segundo es lo correcto**, y es trabajo suyo.

### 5.2. No hay identificador propuesto por el llamante

`next_available_employee_no()` recorre `users` y devuelve el entero libre más bajo. El llamante no
puede proponer el suyo, así que:

* **No hay idempotencia.** Reenviar la misma alta crea un segundo usuario, no actualiza el primero.
* El contrato deriva el `employeeNo` del `credentialId` que envía el backend. Eso hoy no es posible.

Es la incompatibilidad más profunda con `PUT /v1/credentials/{credentialId}`.

### 5.3. La API no está pensada para otro servidor

Tres obstáculos concretos: la cabecera `Origin` obligatoria en todo `POST`, el bind a loopback con
doble opt-in, y la instrucción explícita del README de **no publicar `iot.construiblec.cloud`**
hasta tener Cloudflare Access.

El último no es un obstáculo sino la solución: **Cloudflare Access con un service token** es
exactamente el mecanismo que necesita un llamante máquina, y encaja con que Render no garantice IP
de salida. La comprobación de `Origin` debería desaparecer para las rutas máquina y quedarse solo
para el frontend.

### 5.4. No hay eventos de apertura

**Corrige lo que este documento asumió antes.** El contrato daba por hecho que el servidor recibía
eventos y solo había que decidir si empujarlos o consultarlos. No los recibe: no hay nada en el
código que lea `AcsEvent` ni ningún receptor de eventos.

Consecuencia: hoy **no existe auditoría de aperturas en ningún sitio**. Ni en el backend, que la
delegó, ni aquí. Con PIN de cuatro dígitos eso duele más de lo previsto, porque una ráfaga de
`access_denied` es la señal de fuerza bruta y nadie la está mirando. Hay que construirlo, y decidir
de qué lado.

### 5.5. Un solo edificio — deja de ser un defecto

`config.buildings[0]` en la ruta de creación; el esquema aguanta varios, la API y el frontend no.

Bajo el encuadre corregido **esto ya no es una carencia**: un gateway sirve a un edificio por
definición, y que la aplicación lo asuma es coherente. Lo que sí queda pendiente es del lado de la
VPS —consolidar Inglaterra y Pradera con clave de edificio explícita, como pide la §9 de su guía—
y del reparto de repositorios ([1.2](#12-estado-real-y-no-es-el-que-parece)): **una copia del código
por edificio no escala.**

### 5.6. Faltan endpoints del contrato

De los cinco pedidos, ninguno existe con esa forma. Correspondencias aproximadas:

| Contrato | Hoy | Falta |
|---|---|---|
| `GET /v1/buildings` | `GET /api/buildings` | Estado del túnel, ámbitos |
| `GET /v1/devices` | `GET /api/devices` | Capacidad, firmware, desviación de reloj |
| `PUT /v1/credentials/{id}` | `POST /api/create-pin-user` | Idempotencia, id del llamante, edificio, resultado por dispositivo |
| `DELETE /v1/credentials/{id}` | `POST /api/delete-device-user` | Direccionar por credencial, no por par usuario-dispositivo |
| `GET /v1/health` | `GET /api/health` | Devuelve `{"status":"ok"}` y nada más |

---

## 6. Defectos que hay que corregir de todos modos

Independientes de dónde acabe la gestión de pines.

### 6.1. El PIN en claro y el índice sobre él

`users.pin` y `device_users.pin_on_device` en texto plano, más `idx_users_pin`. Un volcado del
fichero SQLite rinde todos los PINs del edificio. La API los oculta bien; el fichero no.

Si la gestión pasa al backend, esto **desaparece solo**: el servidor recibe el PIN, lo escribe y lo
descarta, y `pin_on_device` puede reducirse a un booleano o a una huella. Es uno de los beneficios
concretos del reparto propuesto.

### 6.2. `employee_no` se recicla y no tiene prefijo

Dos problemas que se combinan mal:

* `next_available_employee_no()` devuelve **el hueco más bajo**. Y `delete_user_assignment()`
  borra la fila de `users` cuando no quedan asignaciones. Así que el número de un huésped que se
  fue **se reasigna al siguiente**. Cualquier auditoría futura atribuiría sus aperturas a la
  persona equivocada.
* No hay prefijo que marque lo creado por el sistema. Un `employeeNo` `"7"` puede coincidir con un
  residente cargado a mano por iVMS-4200, y `create_user` lo **sobrescribiría**. Es el riesgo de
  «dejar gente fuera de su casa» del diseño original, vivo en el código.

La corrección es la del contrato: identificador **derivado del `credentialId`, con prefijo
reservado**, y nunca reutilizado.

### 6.3. La sincronización trunca a 50 usuarios

`HikvisionClient.get_users(max_results=50)` con `searchResultPosition: 0` fijo, sin paginar. Y
`sync_all_devices()` lo llama con el valor por defecto, para después ejecutar
`replace_device_membership()`, que hace `DELETE FROM device_users WHERE device_id = ?`.

En un terminal con más de 50 usuarios, **cada sincronización borra del espejo a todos los demás**.
El aparato queda intacto, pero la base pierde de vista a la mayoría de sus usuarios, y el reporte
de duplicados y el inventario dejan de ser fiables. `search_user()` usa 200, que solo mueve el
problema.

Hay que paginar con `searchResultPosition` hasta agotar el listado.

### 6.4. La escritura multi-dispositivo no es atómica, y el fallo se autolegitima

`create_pin_access_user()` escribe dispositivo por dispositivo. Si el segundo falla, la excepción
sube, `with_write_connection` no llega al `commit` y la base no registra nada — **pero el primer
terminal ya tiene el usuario escrito**.

Lo grave no es el huérfano, sino lo que pasa después: como `sync` importa lo que hay en el aparato,
el siguiente barrido **lo adopta como usuario legítimo**. Un PIN que el sistema cree que nunca
existió queda abriendo una puerta, indefinidamente y sin rastro.

Con el backend como autoridad esto se resuelve solo: el estado por dispositivo se reporta
(`written` / `partial` / `failed`), la credencial queda en `pending` y el barrido reintenta.

### 6.5. La unicidad del PIN se informa pero no se impide

`idx_users_pin` no es único, y `/api/duplicates` solo cuenta. Con cuatro dígitos y un espacio de
10.000 combinaciones, dos huéspedes con el mismo PIN es cuestión de tiempo, y hoy nada lo evita.

### 6.6. Nada purga los vencidos

`get_expired_users()` lista credenciales caducadas; ninguna rutina las borra del terminal. Como los
huéspedes rotan, los registros se acumulan hasta el tope del modelo y el equipo **empieza a
rechazar altas**. No es higiene opcional.

---

## 7. Lo que hay que conservar

Buena parte del repositorio es exactamente lo que hace falta, y rehacerlo sería un error:

* **`hikvision/client.py`.** Envoltorio ISAPI limpio, Digest, política de reintentos correcta.
  Resuelve el punto que el diseño original marcaba como el de mayor riesgo de campo.
* **`hikvision/url_builder.py`.** Direccionamiento Tailscale 4via6, con pruebas.
* **Las columnas `*_on_device`.** El espejo de lo que hay realmente en el aparato. Es el insumo de
  conciliación, y es la mejor decisión de diseño del repositorio.
* **Credenciales ISAPI por variable de entorno**, con la negativa a arrancar si aparecen columnas
  heredadas. Adoptarlo también en el backend: mejora el diseño original.
* **Las salvaguardas del control físico.** `request_id`, confirmación explícita, bloqueo por
  resultado incierto, historial. Trabajo cuidadoso que no hay que tocar.
* **`sync_history`.** Tiene un valor que el contrato no había previsto: es el latido por
  dispositivo.
* **La postura de seguridad en general.** `SECURITY.md`, `docs/security-review.md` y los tests de
  seguridad muestran un equipo que piensa en esto. Conviene apoyarse en ellos, no pasarles por
  encima.

---

## 8. Plan de convergencia

Sin reescribir nada, y sin apagar lo que hoy funciona en Inglaterra.

### Fase −1 — Restaurar el servicio

Es de ellos y va antes que todo lo demás: **hoy no hay nada corriendo en Inglaterra**
([1.2](#12-estado-real-y-no-es-el-que-parece)). Restaurar con `systemd` y `Restart=on-failure` es
el primer ítem de su propio backlog, y la plantilla ya está en `deploy/systemd/`.

Corrige además una suposición de la primera versión de este análisis: las correcciones de la fase 0
**no compiten con un servicio vivo**, porque no lo hay. Eso las abarata, no las urge menos.

### Fase 0 — Corregir lo que ya está mal

Independiente de todo lo demás: paginar el `sync` ([6.3](#63-la-sincronización-trunca-a-50-usuarios)),
dejar de reciclar `employee_no` ([6.2](#62-employee_no-se-recicla-y-no-tiene-prefijo)), y hacer
único el índice del PIN ([6.5](#65-la-unicidad-del-pin-se-informa-pero-no-se-impide)).

Ninguna de las tres aparece en la guía ni en su backlog. No es contradicción: su §5 describe
controles de seguridad, que son reales, y sus 38 pruebas cubren seguridad HTTP, `request_id`,
migraciones y construcción de URL — **no la paginación del `sync` ni la unicidad del PIN**. Son
huecos de cobertura. Y la propia guía zanja cómo resolverlo: *«prevalecen el comportamiento
comprobado por pruebas»*, así que lo que hace falta es añadir esas pruebas.

### Fase 1 — Espacio de nombres

Prefijo reservado en `employee_no` para lo que cree el backend, y la regla de que **nada sin ese
prefijo se borra jamás**. Es prerrequisito de la conciliación y protege a los residentes cargados
a mano. Se puede hacer hoy, antes de que exista integración alguna.

### Fase 2 — Superficie máquina, **en la VPS central**

Las cinco rutas del contrato. Bajo el encuadre corregido no se añaden a esta aplicación: nacen en
la VPS que aún no existe, y esta se queda con sus `/api/` para el operador local. Autenticación por
Cloudflare Access con service token —que su §11 ya contempla y cuyo túnel *«está saludable»*—, sin
comprobación de `Origin`, `PUT` idempotente con el `credentialId` del backend, y marcas de tiempo
con offset.

Aquí encaja el acuerdo de frontera de [más abajo](#el-choque-de-alcance-que-la-guía-no-ve): **la VPS
no lleva ciclo de vida de credenciales ni portal de huéspedes.**

### Fase 3 — Invertir la conciliación

El cambio de fondo: `sync` deja de sobrescribir la intención y pasa a **reportar diferencias**. Lo
que tenga el prefijo del backend y no coincida se reescribe con el valor de Postgres; lo que no lo
tenga se informa y no se toca.

### Fase 4 — Multi-edificio

Quitar `buildings[0]` de la ruta de creación, resolver el `via_id` y las credenciales por edificio,
y migrar identidades como advierte `security-review.md`.

### Fase 5 — Eventos y purga

Lectura periódica de `AcsEvent` por rango, y borrado de los vencidos del terminal. Es lo que cierra
la auditoría y lo que evita que los equipos se llenen.

### Qué se puede entregar por separado

* La fase −1 devuelve el servicio a Inglaterra; es requisito de todo lo demás.
* La fase 0 corrige defectos reales sin integración de por medio.
* Las fases 1–2 permiten al backend emitir credenciales reales.
* La fase 3 es la que convierte «revocado» en un hecho.
* Las fases 4–5 escalan al resto de edificios y cierran la auditoría.

### Lo que hay que acordar antes de escribir código

Tres conversaciones, y ninguna es técnica:

1. **La frontera backend ↔ VPS** ([más abajo](#el-choque-de-alcance-que-la-guía-no-ve)). Quién lleva
   el ciclo de vida de la credencial. Bloquea el esquema de los dos lados.
2. **De quién es el portal del huésped.** Hoy está en los dos planes.
3. **Si el tramo VPS ↔ gateway es síncrono** ([2.1](#21-explícitas-y-bien-tomadas)). Decide si
   vuelven la cola y el PIN en reposo.
