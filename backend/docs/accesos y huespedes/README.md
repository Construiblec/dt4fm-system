# Control de Accesos y Portal del Huésped

**DT4FM – Digital Twin for Facility Management**

## Índice

1. [Introducción](#1-introducción)
2. [Objetivos de diseño](#2-objetivos-de-diseño)
3. [Arquitectura: tres planos](#3-arquitectura-tres-planos)
4. [Punto de partida: qué existe hoy](#4-punto-de-partida-qué-existe-hoy)
5. [Modelo de datos](#5-modelo-de-datos)
6. [Ciclo de vida de una credencial](#6-ciclo-de-vida-de-una-credencial)
7. [Identidad del huésped sin cuenta](#7-identidad-del-huésped-sin-cuenta)
8. [Estructura de módulos y archivos](#8-estructura-de-módulos-y-archivos)
9. [Endpoints](#9-endpoints)
10. [El agente de la Raspberry](#10-el-agente-de-la-raspberry)
11. [Integración con Hikvision (ISAPI)](#11-integración-con-hikvision-isapi)
12. [Conciliación y purga](#12-conciliación-y-purga)
13. [Seguridad](#13-seguridad)
14. [Variables de entorno](#14-variables-de-entorno)
15. [Migración de base de datos](#15-migración-de-base-de-datos)
16. [Plan de implementación](#16-plan-de-implementación)
17. [Decisiones abiertas](#17-decisiones-abiertas)

---

## 1. Introducción

Este documento describe dos piezas que comparten el mismo modelo de datos y se implementan juntas:

* **Control de accesos.** Emisión, distribución, revocación y auditoría de PINs de acceso peatonal y vehicular sobre equipos **Hikvision**, para huéspedes, residentes y personal.
* **Portal del huésped.** Un panel web donde quien reserva por Hostaway ve su departamento, sus PINs, el estado de la unidad y el funcionamiento de los servicios, **sin crear una cuenta**.

Se documentan juntos porque el portal es el consumidor principal del control de accesos: sin credenciales que mostrar el panel pierde su razón de ser, y sin un canal donde mostrarlas el PIN no llega a nadie.

### Alcance

Dentro:

* Emisión automática de credenciales desde reservas de Hostaway y desde tareas de limpieza.
* Sincronización con terminales Hikvision mediante un agente por edificio.
* Auditoría de aperturas.
* Acceso del huésped mediante enlace firmado, sin cuenta ni contraseña.

Fuera por ahora:

* Pantalla de administración para alta manual de residentes y personal (la emisión existe; la interfaz no).
* Histórico de telemetría — ver sección [17](#17-decisiones-abiertas).
* Reconocimiento de placas (ANPR) — depende de una decisión de hardware pendiente.

---

## 2. Objetivos de diseño

* **Una sola autoridad.** El backend decide qué PIN existe, para quién y hasta cuándo. Ningún otro componente inventa credenciales.
* **La puerta no depende de la nube.** El terminal Hikvision valida y abre sin red. Que Render duerma, que caiga la VPN o que falle el enlace del edificio no puede dejar a nadie fuera de su casa. La restricción no es teórica: el propio repositorio ya documenta que *«Render duerme y reinicia la instancia»* (`reset-token.service.ts`).
* **Ninguna credencial en el borde que no haga falta.** La Raspberry no guarda PINs. Si el dispositivo se pierde o alguien entra por la VPN, no hay nada que llevarse ahí.
* **La revocación es demostrable.** Se registra en qué dispositivos quedó escrita cada credencial. Sin eso, «revocado» es una suposición.
* **Nunca borrar lo que no se creó.** Los terminales contienen usuarios cargados a mano. Un barrido automático que elimine lo desconocido deja gente en la calle.
* **El huésped no es un usuario del sistema.** Es el portador temporal de un permiso. No tiene cuenta ni contraseña, y no deja nada que limpiar después.
* **Fallar cerrado, con salida manual documentada.** Ante duda —reloj no confiable, sincronización incierta— la puerta no se abre, y existe un procedimiento humano de respaldo. Un huésped que llama a portería es un mal rato; una puerta que se abre sola es un incidente.

---

## 3. Arquitectura: tres planos

```text
┌─────────────────────────────────────────────────────────────┐
│  PLANO DE CONTROL — Backend NestJS (Render) + Postgres      │
│                                                             │
│  · Genera el PIN, decide la vigencia                        │
│  · Vincula credencial ↔ reserva / Tenant / Employee         │
│  · Registro maestro y auditoría                             │
│  · Sirve el portal del huésped                              │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │  HTTPS iniciado por el agente
                          │  (sondeo de trabajos + reporte)
                          │
┌─────────────────────────────────────────────────────────────┐
│  PLANO DE SINCRONIZACIÓN — Raspberry Pi, una por edificio   │
│                                                             │
│  · Cola local de trabajos pendientes                        │
│  · Traduce intención → ISAPI                                │
│  · Bufferiza eventos de apertura                            │
│  · Concilia el inventario del dispositivo                   │
│  · NO guarda PINs. NO decide accesos.                       │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │  ISAPI sobre LAN aislada
                          │
┌─────────────────────────────────────────────────────────────┐
│  PLANO DE EJECUCIÓN — Terminales Hikvision                  │
│                                                             │
│  · Almacenan su copia del usuario, PIN y vigencia           │
│  · Validan y abren, sin red                                 │
│  · Emiten eventos de apertura                               │
└─────────────────────────────────────────────────────────────┘
```

### Por qué el control lo inicia el agente y no el backend

Existe una VPN que une las Raspberrys, y sería técnicamente posible que el backend empujara órdenes hacia abajo. No se hace, por tres motivos:

1. **El backend está en Render.** Meterlo en la VPN acopla cada despliegue a la topología de red de los edificios y a una IP de salida que Render no garantiza.
2. **El sondeo sobrevive a más fallos.** Un agente que pregunta «¿hay algo para mí?» se recupera solo tras un corte; un empuje perdido hay que reintentarlo desde arriba con estado adicional.
3. **Reduce superficie.** Ningún puerto escuchando dentro del edificio.

La VPN queda como **defensa en profundidad y canal de administración**, no como camino de control. Si la revocación inmediata se vuelve un requisito duro, el modelo de trabajos admite añadir un canal de empuje sin rehacer el esquema.

### Qué guarda cada plano

| | Guarda | No guarda |
|---|---|---|
| **Backend / Postgres** | PIN cifrado, huella, vigencia, vínculo con la persona, en qué dispositivos quedó escrito, eventos | — |
| **Raspberry** | Trabajos pendientes, eventos sin enviar, credenciales ISAPI de sus dispositivos | **Ningún PIN**, ningún dato personal del huésped |
| **Hikvision** | Su copia del usuario, PIN y ventana de vigencia | Nada sobre reservas, unidades ni contratos |
| **openMAINT** | El activo físico del terminal, para su mantenimiento | **Nada sobre PINs ni credenciales** |

### Por qué openMAINT no participa

openMAINT es el CAFM: activos, mantenimientos, unidades e inquilinos. No cifra atributos, su lectura está abierta a roles amplios y un PIN no es un dato de mantenimiento. Lo único que corresponde registrar allí es el **activo físico** del terminal o la barrera, para que sus averías entren por el flujo de correctivos que ya funciona (`docs/integrations/openmaint-iot-alarms.md`).

Sí hace falta **un cambio menor** en openMAINT, descrito en [5.8](#58-cambio-requerido-en-openmaint).

---

## 4. Punto de partida: qué existe hoy

Verificado sobre el código, no supuesto.

### Ya existe y se reutiliza

| Pieza | Ubicación | Qué aporta |
|---|---|---|
| Hostaway OAuth + reservas paginadas | `src/integrations/hostaway/hostaway.service.ts` | Origen de las estancias |
| Webhook `POST /webhooks/hostaway` | `src/modules/billing/billing.controller.ts` | Punto de enganche para emitir al confirmarse una reserva |
| Token HMAC autocontenido | `src/modules/password-recovery/reset-token.service.ts` | Patrón exacto del enlace del huésped |
| Limitador de intentos | `src/modules/password-recovery/rate-limiter.service.ts` | Protege el canje del token |
| Correo (Resend / SMTP) | `src/modules/notifications/mail/mailer.service.ts` | Entrega del enlace |
| Identidad desde sesión + guard por recurso | `src/modules/owners/owners-identity.service.ts` y `guards/owner-session.guard.ts` | Patrón del `GuestSessionGuard` |
| Guard de secreto compartido con la Pi | `src/modules/iot-alarms/guards/iot-webhook.guard.ts` | Base del `GatewayAuthGuard`, con la corrección de la sección [13](#13-seguridad) |
| Postgres + TypeORM + migraciones | `src/database/data-source.ts` | Hoy solo lo usa push-notifications |
| Planificador | `ScheduleModule.forRoot()` en `app.module.ts` | Conciliación nocturna y purga |

### No existe y hay que construirlo

* **Todo lo relativo a Hikvision.** Búsqueda de `hikvision|isapi|ivms|acsevent|employeeno` en `src/` y `docs/`: cero resultados.
* **Todo lo relativo a PINs y control de accesos.**
* **El mapeo `listingId` ↔ `Unit`.** En `cleaning-tasks.service.ts` la tarea se crea con `HostawayReservation` y una descripción, pero **el atributo `Unit` no se rellena**: se asigna a mano después. Sin ese mapeo el portal no sabe de qué departamento hablar.
* **Canal de bajada hacia la Raspberry.** El contrato actual es de una vía: la Pi empuja a `POST /iot/alarms` y no hay ninguna variable de salida hacia ella en `.env.example`.
* **Telemetría.** La Pi emite alarmas discretas; no se guarda ninguna lectura. «Temperatura actual» no tiene fuente hoy.

---

## 5. Modelo de datos

Siete tablas en el Postgres del backend. Convenciones tomadas de las tablas existentes de push-notifications: columnas en `snake_case`, claves primarias `uuid` con `gen_random_uuid()`, marcas de tiempo `timestamptz`.

Relación entre ellas:

```text
access_gateway (1 Raspberry por edificio)
      │ 1..n
      ▼
access_device (terminal / barrera)
      │ 1..n
      ▼
credential_placement ◄──── n..1 ──── access_credential
      │                                     ▲
      │                                     │ 0..n
      ▼                                     │
access_event                          guest_stay ──1..n── guest_portal_log
```

`access_credential` es el centro: todo lo demás la sostiene (dónde vive, quién la usó) o la origina (`guest_stay`).

---

### 5.1. `access_gateway` — la Raspberry de cada edificio

Un registro por agente. Existe para dar a cada dispositivo **credencial propia**, y así poder revocar uno sin tocar la flota. Hoy el repositorio usa un único `IOT_WEBHOOK_SECRET` compartido: suficiente para alarmas, insuficiente para puertas.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` PK | no | Identidad interna. |
| `code` | `text` UNIQUE | no | Nombre operativo legible, p. ej. `RPI-TORRE-A`. Es lo que se ve en logs y pantallas de soporte; nunca cambia. |
| `building_id` | `int` | no | `_id` de la card `Building` en openMAINT. No es clave foránea: openMAINT es un sistema externo. |
| `secret_hash` | `text` | no | Hash Argon2id del secreto del agente. **Nunca se guarda el secreto en claro**; se muestra una sola vez al aprovisionar. |
| `secret_version` | `int` | no | Incrementa al rotar. Permite forzar re-aprovisionamiento y detectar agentes con credencial vieja. |
| `agent_version` | `text` | sí | Versión del software del agente, reportada en cada sondeo. Sirve para saber qué edificios faltan por actualizar. |
| `enabled` | `bool` | no | `false` deja de entregar trabajos sin borrar el histórico. Baja lógica. |
| `last_poll_at` | `timestamptz` | sí | Último sondeo recibido. **Es el latido**: si supera el umbral, el edificio está incomunicado y hay que avisar. |
| `created_at` | `timestamptz` | no | `now()` por defecto. |

**Índices:** único en `code`.

**Nota operativa.** `last_poll_at` es la señal más valiosa de la tabla. Un agente caído no produce errores visibles —las puertas siguen funcionando con lo ya sincronizado— pero las altas y revocaciones dejan de aplicarse en silencio. Debe existir una alerta sobre este campo.

---

### 5.2. `access_device` — el terminal o la barrera

Un registro por equipo Hikvision. Modela *dónde* puede escribirse una credencial.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` PK | no | Identidad interna. |
| `code` | `text` UNIQUE | no | Nombre operativo, p. ej. `TORRE-A-PEATONAL-1`. |
| `gateway_id` | `uuid` FK → `access_gateway` | no | Qué agente lo alcanza. Un dispositivo pertenece a exactamente una Raspberry. |
| `building_id` | `int` | no | `Building._id` de openMAINT. Redundante con el gateway a propósito: permite consultar por edificio sin join. |
| `openmaint_asset_id` | `int` | sí | `_id` del `Asset` del equipo físico. Es **el puente con mantenimiento**: enlaza este dispositivo con sus correctivos y con las alarmas IoT que ya usan `assetCode`. |
| `kind` | `text` | no | `terminal` (teclado peatonal), `barrier` (barrera vehicular), `anpr` (lector de placas). Determina qué operaciones ISAPI aplican. |
| `scope` | `text` | no | `pedestrian` o `vehicular`. Una credencial solo se escribe en dispositivos cuyo `scope` cubra el suyo. |
| `host` | `text` | no | IP o nombre en la LAN del edificio. Solo la Raspberry la resuelve; el backend nunca la contacta. |
| `port` | `int` | no | Puerto ISAPI. Por defecto `80`. |
| `door_no` | `int` | no | Número de puerta dentro del controlador. Los terminales de una puerta usan `1`; los controladores multipuerta, `1..n`. |
| `isapi_username` | `text` | no | Usuario de administración del equipo. **Distinto por dispositivo** (ver sección 13). |
| `isapi_password_enc` | `text` | no | Contraseña cifrada con AES-256-GCM. El agente la recibe descifrada solo dentro de su configuración, por canal autenticado. |
| `capacity_users` | `int` | sí | Tope de usuarios del modelo. Alimenta la alerta de saturación descrita en [12.2](#122-purga). |
| `firmware` | `text` | sí | Versión reportada. Importa porque **ISAPI varía entre firmwares** y una actualización puede romper la integración. |
| `enabled` | `bool` | no | Baja lógica. |
| `last_seen_at` | `timestamptz` | sí | Última vez que el agente lo contactó con éxito. |
| `created_at` / `updated_at` | `timestamptz` | no | Auditoría. |

**Índices:** único en `code`; índice en `gateway_id`; índice en `(building_id, scope)`, que es la consulta caliente al emitir una credencial.

**Por qué `openmaint_asset_id` es opcional.** El control de accesos debe funcionar aunque el activo no esté dado de alta en openMAINT. Enlazarlo mejora el mantenimiento, pero no puede ser un bloqueo para abrir una puerta.

---

### 5.3. `access_credential` — el permiso

La tabla central. Un registro es **un permiso de acceso**: un PIN, para un sujeto, con un ámbito y una ventana de validez. Es independiente de en cuántos aparatos acabe escrito.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` PK | no | Identidad interna. |
| `subject_type` | `text` | no | `guest`, `tenant` o `employee`. Determina el ciclo de vida y quién puede consultarla. |
| `subject_ref` | `text` | no | Referencia al sujeto en su sistema de origen: `hostawayReservationId` para huéspedes, `Tenant._id` para residentes, `Employee._id` para personal. Es texto porque los tres espacios no comparten formato. |
| `display_name` | `text` | no | Nombre de la persona **en el momento de emitir**. Denormalizado a propósito: la auditoría debe seguir siendo legible aunque la reserva se borre en Hostaway o el empleado cause baja. |
| `scope` | `text` | no | `pedestrian`, `vehicular` o `both`. Decide en qué dispositivos se coloca. |
| `building_id` | `int` | no | `Building._id`. Acota la búsqueda de dispositivos y la unicidad del PIN. |
| `openmaint_unit_id` | `int` | sí | `Unit._id` cuando el permiso corresponde a un departamento concreto. Nulo en accesos que solo cubren áreas comunes. |
| `pin_ciphertext` | `text` | no | PIN cifrado con AES-256-GCM, en formato `iv:tag:ciphertext` (base64url). Ver el porqué más abajo. |
| `pin_fingerprint` | `text` | no | `HMAC-SHA256(clave_servidor, pin)` en hex. Permite comprobar unicidad, conciliar contra el dispositivo y correlacionar eventos **sin descifrar nada**. |
| `pin_last_rotated_at` | `timestamptz` | sí | Última vez que se regeneró el PIN de esta credencial. |
| `valid_from` | `timestamptz` | no | Inicio de vigencia. Para huéspedes, `llegada − margen`. |
| `valid_to` | `timestamptz` | no | Fin de vigencia. Para huéspedes, `salida + margen`. |
| `status` | `text` | no | Máquina de estados de la sección [6](#6-ciclo-de-vida-de-una-credencial): `pending`, `active`, `revoked`, `expired`, `purged`. |
| `revoked_at` | `timestamptz` | sí | Momento de la revocación. |
| `revoked_reason` | `text` | sí | Texto libre acotado: `reservation_cancelled`, `dates_changed`, `manual`, `contract_ended`, `task_cancelled`. Sin esto, las revocaciones son indistinguibles al investigar un incidente. |
| `issued_by` | `text` | no | Qué originó la emisión: `hostaway-webhook`, `cleaning-task`, `manual:<username>`. Responde «¿de dónde salió este PIN?» sin cruzar tablas. |
| `guest_stay_id` | `uuid` FK → `guest_stay` | sí | Presente solo cuando `subject_type = 'guest'`. Permite revocar en bloque al cancelarse una estancia. |
| `created_at` / `updated_at` | `timestamptz` | no | Auditoría. |

**Índices:**

* `(subject_type, subject_ref)` — «¿qué tiene esta persona?».
* `(status, valid_to)` — lo consulta el barrido de expiración y purga.
* `guest_stay_id`.
* Índice único parcial de unicidad:

```sql
CREATE UNIQUE INDEX uq_credential_pin_activo
  ON access_credential (building_id, scope, pin_fingerprint)
  WHERE status IN ('pending', 'active');
```

#### Por qué el PIN va cifrado y no hasheado

Lo natural en credenciales es hashear. Aquí no se puede: **el portal tiene que mostrarle el PIN al huésped**, no solo una vez al emitirlo sino cada vez que abra el panel durante su estancia. Un hash lo impide.

La contrapartida se compensa así:

* Clave de cifrado **separada** de `DATABASE_URL`, en `ACCESS_PIN_KEY`. Quien vuelque la base de datos sin acceso al entorno no obtiene PINs.
* Cifrado autenticado (**AES-256-GCM**), que detecta manipulación del texto cifrado.
* `pin_fingerprint` como campo de trabajo, para que las operaciones habituales —unicidad, conciliación, correlación de eventos— **nunca descifren**. El descifrado ocurre en un único punto del código: mostrarle el PIN a su dueño.
* Cada lectura queda registrada en `guest_portal_log`.

#### Por qué la unicidad es acotada y no global

Un índice único global sobre el PIN se agota: con seis dígitos hay un millón de combinaciones, pero la reutilización histórica lo estrecharía año a año hasta hacer imposible emitir. La unicidad solo hace falta donde el conflicto es real: **el mismo edificio, el mismo ámbito, al mismo tiempo**. De ahí el índice parcial sobre estados vivos.

A eso se suma, en el generador y no en el esquema, un **periodo de enfriamiento**: un PIN liberado no se reasigna hasta pasados `ACCESS_PIN_COOLDOWN_DAYS` días. El huésped anterior lo recuerda, y las cerraduras no distinguen memoria de autorización.

> **Verificar en campo.** Algunos firmwares de Hikvision exigen que el PIN sea único entre los usuarios del propio terminal. Si es el caso, el índice parcial de arriba es *condición necesaria pero no suficiente*: la unicidad hay que comprobarla además contra el inventario conciliado del dispositivo, o la escritura fallará en silencio y el huésped llegará a una puerta que no abre.

---

### 5.4. `credential_placement` — dónde quedó escrita

La pieza que convierte «revocado» en un hecho verificable. Una credencial puede vivir en varios terminales (portal peatonal, puerta de torre, barrera). Esta tabla registra **una fila por cada par credencial–dispositivo**, con su propio estado de sincronización.

Sin ella, revocar sería un acto de fe: no habría forma de saber en qué aparatos quedó realmente escrito el PIN, ni de detectar el que falló.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` PK | no | Identidad interna. |
| `credential_id` | `uuid` FK → `access_credential` | no | Qué permiso. `ON DELETE RESTRICT`: una credencial nunca se borra mientras siga escrita en algún sitio. |
| `device_id` | `uuid` FK → `access_device` | no | En qué aparato. |
| `employee_no` | `text` | no | **La clave del registro dentro del Hikvision.** Ver [11.2](#112-el-espacio-de-nombres-de-employeeno). Se guarda aquí porque es lo único que permite borrar después con precisión. |
| `state` | `text` | no | `pending_write`, `written`, `pending_delete`, `deleted`, `failed`. Es la cola de trabajo del agente. |
| `attempts` | `int` | no | Intentos consumidos. Por defecto `0`. Alcanzado `ACCESS_MAX_ATTEMPTS` pasa a `failed` y deja de reintentarse solo. |
| `last_attempt_at` | `timestamptz` | sí | Cuándo se intentó por última vez. Alimenta el retroceso exponencial. |
| `last_error` | `text` | sí | Mensaje del último fallo, acotado. Es lo primero que mira soporte. |
| `claimed_at` | `timestamptz` | sí | Momento en que un agente tomó el trabajo. Evita que dos sondeos solapados ejecuten lo mismo; se libera al vencer `ACCESS_JOB_LEASE_SECONDS`. |
| `created_at` / `updated_at` | `timestamptz` | no | Auditoría. |

**Índices:**

* `UNIQUE (credential_id, device_id)` — una credencial se coloca una sola vez por dispositivo.
* `UNIQUE (device_id, employee_no)` — refleja la restricción real del aparato: dentro de un terminal, `employee_no` es la clave primaria.
* `(device_id, state)` — la consulta del sondeo: «trabajos pendientes de este dispositivo».

#### Los estados no son decorativos

`pending_write` y `pending_delete` **son la cola**. No hay tabla de trabajos aparte: el trabajo pendiente *es* una fila cuyo estado difiere del deseado. Eso hace la cola idempotente por construcción — si el agente ejecuta dos veces la misma escritura, el resultado es idéntico — y elimina la posibilidad de que la cola y el estado real se desincronicen, que es el fallo clásico de las colas separadas.

`failed` merece atención humana: significa que la credencial existe en el sistema pero **no está en la puerta**, o al revés. Es el estado que debe alimentar la alerta operativa.

---

### 5.5. `access_event` — quién abrió, cuándo

Auditoría de uso. La escribe el agente reenviando lo que emiten los terminales. Es la tabla de mayor volumen del módulo.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `bigserial` PK | no | Secuencial, no `uuid`: es tabla de alto volumen y el orden de inserción importa para leerla. |
| `device_id` | `uuid` FK → `access_device` | no | Dónde ocurrió. |
| `employee_no` | `text` | sí | Clave del usuario según el dispositivo. Nulo en eventos que no involucran usuario (puerta forzada, sabotaje). |
| `credential_id` | `uuid` FK → `access_credential` | sí | Resuelto al ingerir, cruzando `(device_id, employee_no)` contra `credential_placement`. Nulo si el usuario no lo creó este sistema — un residente cargado a mano, por ejemplo. |
| `event_type` | `text` | no | `access_granted`, `access_denied`, `door_forced`, `door_open_timeout`, `tamper`, `device_offline`. |
| `reason` | `text` | sí | Motivo del rechazo cuando el dispositivo lo aporta: PIN inválido, fuera de vigencia, sin permiso. |
| `occurred_at` | `timestamptz` | no | **Hora del dispositivo.** Puede ir desviada; ver [13](#13-seguridad). |
| `received_at` | `timestamptz` | no | Hora en que el backend lo recibió. La diferencia con `occurred_at` revela cuánto estuvo el agente sin conexión. |
| `dedupe_key` | `text` UNIQUE | no | `<device_id>:<serial del evento en el dispositivo>`. La entrega es *al menos una vez*: el agente reenvía tras un corte y este índice absorbe los duplicados. |
| `raw` | `jsonb` | sí | Evento original íntegro. Mismo criterio que las alarmas IoT, que ya conservan el cuerpo completo: los campos que hoy no se modelan mañana hacen falta, y no exige desplegar nada para empezar a recogerlos. |

**Índices:** único en `dedupe_key`; `(credential_id, occurred_at)` para el histórico de una persona; `(device_id, occurred_at)` para el de una puerta.

**Retención.** La tabla crece sin techo. Definir una política —por ejemplo, detalle 12 meses y agregados después— antes de que el volumen la imponga.

---

### 5.6. `guest_stay` — la estancia

Proyección local de una reserva de Hostaway. **No duplica la reserva**: guarda solo lo que el portal necesita servir rápido y lo que el control de accesos necesita para decidir. Hostaway sigue siendo la fuente de verdad de la reserva.

Existe por tres razones que Hostaway no cubre: dar un ancla estable al token del huésped, permitir revocación (`token_version`), y evitar una llamada a la API externa en cada carga del panel.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `uuid` PK | no | Identidad interna. Es lo que viaja dentro del token del huésped. |
| `hostaway_reservation_id` | `text` UNIQUE | no | Clave natural. El único enlace con Hostaway. |
| `listing_id` | `text` | no | `listingMapId` de Hostaway. Se conserva aunque ya se haya resuelto la unidad, para poder rehacer el mapeo si cambia. |
| `openmaint_unit_id` | `int` | sí | `Unit._id` resuelto vía [5.8](#58-cambio-requerido-en-openmaint). **Nulo es un estado esperado**, no un error: si el listing no está mapeado, la estancia existe pero el panel no puede mostrar el departamento. Debe alertar. |
| `building_id` | `int` | sí | Derivado de la unidad. Cacheado para no consultar openMAINT en cada carga. |
| `guest_name` | `text` | no | Nombre del huésped principal. |
| `guest_email` | `text` | sí | Destino del enlace. Nulo cuando el canal lo oculta — Airbnb entrega correos anonimizados o ninguno. |
| `guest_phone` | `text` | sí | Canal alternativo de entrega. |
| `guest_last_name_hash` | `text` | sí | Hash del apellido normalizado (minúsculas, sin acentos ni espacios). **Es el segundo factor** del canje del token. Se guarda hasheado porque solo hace falta compararlo. |
| `arrival_date` | `date` | no | Llegada según Hostaway. |
| `departure_date` | `date` | no | Salida según Hostaway. |
| `access_valid_from` | `timestamptz` | no | Inicio real del acceso: `arrival_date` a la hora de check-in menos `GUEST_ACCESS_LEAD_HOURS`. Se guarda calculado para que la credencial y el panel no puedan discrepar. |
| `access_valid_to` | `timestamptz` | no | Fin real: `departure_date` a la hora de check-out más `GUEST_ACCESS_GRACE_HOURS`. |
| `status` | `text` | no | `pending`, `active`, `completed`, `cancelled`. Espeja el ciclo de la reserva, no el de la credencial. |
| `token_version` | `int` | no | Empieza en `1`. **Incrementarlo invalida todos los enlaces emitidos.** Es lo que da revocación real a un token autocontenido. |
| `portal_opened_at` | `timestamptz` | sí | Primera vez que el huésped canjeó su enlace. Métrica de adopción y señal de soporte: si sigue nulo el día de la llegada, probablemente el enlace no llegó. |
| `created_at` / `updated_at` | `timestamptz` | no | Auditoría. |

**Índices:** único en `hostaway_reservation_id`; `(status, access_valid_to)` para el barrido de cierre; `listing_id`.

#### Sobre `token_version`

El `ResetTokenService` que ya existe en el repositorio consigue invalidación automática derivando la clave de firma del hash de contraseña del usuario, y **no guarda nada**, porque cuando se escribió el backend no tenía base de datos propia. Aquí no hay contraseña de la que derivar, pero sí hay Postgres. `token_version` cumple la misma función de forma explícita: la firma incluye la versión, y subirla en la fila deja fuera a todos los enlaces anteriores. Cancelar una reserva, cambiar sus fechas o reenviar un enlace comprometido son todos un `token_version + 1`.

---

### 5.7. `guest_portal_log` — qué hizo el huésped en el panel

Auditoría del portal, distinta de `access_event`: aquella registra puertas, esta registra **consultas**. Es lo que permite responder «¿quién vio este PIN y desde dónde?» ante una disputa.

| Columna | Tipo | Nulo | Significado |
|---|---|---|---|
| `id` | `bigserial` PK | no | Secuencial. |
| `guest_stay_id` | `uuid` FK → `guest_stay` | no | De quién. |
| `event` | `text` | no | `token_redeemed`, `token_rejected`, `pin_viewed`, `stay_viewed`, `incident_reported`, `vehicle_registered`. |
| `credential_id` | `uuid` | sí | Presente en `pin_viewed`: **qué PIN concreto se reveló**. |
| `ip` | `inet` | sí | Origen. Detecta el enlace reenviado a terceros. |
| `user_agent` | `text` | sí | Contexto del navegador. |
| `detail` | `jsonb` | sí | Carga adicional del evento (motivo del rechazo, placa registrada). |
| `created_at` | `timestamptz` | no | `now()`. |

**Índices:** `(guest_stay_id, created_at)`.

`token_rejected` es el más importante para seguridad: una ráfaga sobre la misma estancia o desde la misma IP es un intento de fuerza bruta y debe cortar el `RateLimiterService`.

---

### 5.8. Cambio requerido en openMAINT

Un solo atributo nuevo, ninguna clase nueva:

| Clase | Atributo | Tipo | Para qué |
|---|---|---|---|
| `Unit` | `HostawayListingId` | `text` | Resolver `listingMapId` → `Unit._id`. |

Es el cambio de mayor rendimiento por esfuerzo de todo el documento. Además del portal, **arregla una carencia actual del módulo de limpieza**: hoy `cleaning-tasks.service.ts` crea la tarea sin rellenar `Unit`, que se asigna a mano después. Con el mapeo, la asignación se vuelve automática.

**No** se crea una clase `Reserva` en openMAINT. Hostaway ya es la fuente de verdad y duplicarla obliga a mantener una sincronía que nadie va a auditar. Solo tendría sentido si operaciones necesitara ver reservas *dentro* de openMAINT, que hoy no es el caso.

**Resolución y caché.** El backend expone `UnitResolverService.byListingId(listingId)`, que consulta `GET /classes/Unit/cards?filter=...` con la sesión de servicio (`OpenmaintServiceSession`, ya existente) y cachea en memoria con TTL, igual que hace `OwnersIdentityService`. Un listing sin mapear no rompe: deja `openmaint_unit_id` nulo, registra un aviso y sigue.

---

## 6. Ciclo de vida de una credencial

```text
                    emitir()
                       │
                       ▼
                  ┌─────────┐   todas las colocaciones escritas
                  │ pending │ ──────────────────────────────┐
                  └─────────┘                               │
                       │                                    ▼
                       │ revocar()                     ┌────────┐
                       │                               │ active │
                       ▼                               └────────┘
                  ┌─────────┐ ◄─────── revocar() ───────────┤
                  │ revoked │                               │
                  └─────────┘                               │ valid_to < now()
                       │                                    ▼
                       │                              ┌─────────┐
                       │                              │ expired │
                       │                              └─────────┘
                       │                                    │
                       └────────────┬───────────────────────┘
                                    │ borrada de todos los dispositivos
                                    ▼
                               ┌────────┐
                               │ purged │
                               └────────┘
```

| Transición | Quién la dispara | Qué ocurre |
|---|---|---|
| → `pending` | `CredentialService.issue()` | Se genera el PIN, se resuelven los dispositivos del ámbito y se crea una fila `credential_placement` en `pending_write` por cada uno. |
| `pending` → `active` | Reporte del agente | Cuando **todas** las colocaciones están en `written`. Mientras alguna falte, sigue `pending`. |
| `*` → `revoked` | `CredentialService.revoke()` | Cancelación, cambio de fechas, fin de contrato, decisión manual. Todas las colocaciones pasan a `pending_delete`. |
| `active` → `expired` | Barrido periódico | `valid_to < now()`. El terminal ya la ignora por su propia ventana; esto es contabilidad. |
| `revoked`/`expired` → `purged` | Barrido de purga | Todas las colocaciones en `deleted`. El PIN se libera para reutilización tras el enfriamiento. |

**`pending` no significa «no funciona».** Significa «aún no está en todas las puertas». Un huésped con la credencial escrita en el portal peatonal pero no en la barrera puede entrar a pie. El panel debe reflejar esa diferencia por dispositivo, no un estado global.

**Cambio de fechas.** Hostaway lo notifica como `reservation_updated`. No se emite un PIN nuevo: se **actualiza la vigencia** de la credencial existente y se reescriben sus colocaciones (`pending_write`). Cambiar el PIN por un cambio de fecha confundiría al huésped, que ya lo tiene anotado.

---

## 7. Identidad del huésped sin cuenta

### 7.1. Por qué no se crea una cuenta

Crear un `User` en openMAINT por huésped es la peor opción disponible: consume usuarios, exige un grupo y privilegios nuevos, obliga a un alta con contraseña para alguien que se queda tres días, y deja cuentas huérfanas que nadie limpia. Un huésped no necesita identidad persistente — necesita **acceso temporal a un recurso**.

### 7.2. El token

Enlace firmado, autocontenido, con revocación por `token_version`. Sigue el patrón de `ResetTokenService`, del que conviene leer los comentarios antes de implementar este.

```text
Formato:  base64url(stayId.tokenVersion.expiresAt) . base64url(hmac)
Clave:    HMAC-SHA256(GUEST_TOKEN_SECRET, payload)
Vigencia: hasta access_valid_to + GUEST_TOKEN_GRACE_HOURS
```

`GuestTokenService`, con la misma forma que el servicio existente:

* `create(stay): string` — firma `id`, `token_version` y caducidad.
* `decode(token): payload | null` — lee **sin verificar**, solo para saber qué estancia consultar. Nunca autoriza.
* `verify(token, stay): boolean` — comprueba firma, caducidad, `token_version` coincidente y `status !== 'cancelled'`. Comparación en tiempo constante con `timingSafeEqual`.

El token es de **larga vida** (dura toda la estancia) y viaja en una URL que acabará en WhatsApp, en el historial del navegador y quizá en logs de intermediarios. Por eso no da acceso por sí solo: hay que canjearlo.

### 7.3. El canje, y por qué hay un segundo factor

```text
POST /guest/session
{ "token": "<...>", "lastName": "Pérez" }
        │
        ├─ decode → stayId
        ├─ cargar guest_stay
        ├─ verify(token, stay)                    ─┐
        ├─ comparar hash(normalizar(lastName))     ├─ RateLimiterService
        ├─ comprobar ventana de acceso            ─┘
        │
        ▼
{ "accessToken": "<JWT 30 min>", "expiresIn": 1800 }
```

El apellido no es una contraseña y no pretende serlo: sube el listón lo justo para que un enlace reenviado por descuido no sea acceso inmediato. `normalizar()` pasa a minúsculas y retira acentos, espacios y signos — un huésped no debe fallar por escribir «Perez».

La sesión resultante es un **JWT corto (30 min)**, con `stayId` y nada más. El enlace largo queda fuera de las peticiones siguientes, y por tanto fuera de los logs de acceso.

`GuestSessionGuard` sigue el patrón de `OwnerSessionGuard`: resuelve la identidad **desde la sesión, nunca desde la URL**. La razón está documentada en aquel guard — los endpoints de propietarios tomaban el identificador de la ruta y bastaba recorrer números para leer datos ajenos. El portal del huésped no debe repetirlo: **no existe ninguna ruta con `:stayId`**. Todas son `/guest/me/...`.

### 7.4. Entrega del enlace

Dos canales, por orden de preferencia:

1. **Mensaje de Hostaway** al huésped. Es donde ya mira, y funciona aunque el canal oculte su correo.
2. **Correo** con `MailerService`, cuando hay `guest_email`.

**El PIN no viaja nunca en el mensaje.** Solo el enlace. Un correo se reenvía, se filtra y se conserva años; el panel exige canje, caduca y queda registrado.

---

## 8. Estructura de módulos y archivos

Dos módulos nuevos en el backend. La integración ISAPI **no vive aquí**: vive en el agente, porque el backend nunca habla con un terminal.

```text
src/modules/access-control/
├── access-control.module.ts
├── entities/
│   ├── access-gateway.entity.ts
│   ├── access-device.entity.ts
│   ├── access-credential.entity.ts
│   ├── credential-placement.entity.ts
│   └── access-event.entity.ts
├── credential.service.ts          # emitir / revocar / reprogramar
├── pin-generator.service.ts       # entropía, unicidad, enfriamiento
├── pin-cipher.service.ts          # AES-256-GCM + huella HMAC
├── placement.service.ts           # cola: reclamar, reportar, reintentar
├── reconciliation.service.ts      # conciliación nocturna + purga
├── access-control.controller.ts   # operación y soporte (sesión openMAINT)
├── gateway.controller.ts          # el agente (auth por credencial de gateway)
├── guards/
│   └── gateway-auth.guard.ts
└── dto/
    ├── claim-jobs.dto.ts
    ├── report-job-result.dto.ts
    ├── ingest-events.dto.ts
    └── device-inventory.dto.ts

src/modules/guest-portal/
├── guest-portal.module.ts
├── guest-portal.controller.ts
├── guest-token.service.ts         # espeja ResetTokenService
├── guest-stay.service.ts          # sincronía con Hostaway
├── stay-composer.service.ts       # arma la respuesta del panel
├── guards/
│   └── guest-session.guard.ts
└── dto/
    ├── redeem-token.dto.ts
    └── report-guest-incident.dto.ts

src/integrations/openmaint/
└── unit-resolver.service.ts       # listingId → Unit._id, con caché
```

### Responsabilidad de cada servicio

**`pin-generator.service.ts`** — El único sitio donde nace un PIN.

```
generate(buildingId, scope):
  para intento en 1..N:
    pin ← N dígitos de randomInt criptográfico
    si esDebil(pin): continuar          # 123456, 000000, repeticiones, escaleras
    huella ← fingerprint(pin)
    si existeActiva(buildingId, scope, huella): continuar
    si usadaRecientemente(huella, cooldownDias): continuar
    devolver { pin, huella }
  lanzar error   # espacio agotado: es una alerta, no un reintento infinito
```

Longitud desde `ACCESS_PIN_LENGTH`, mínimo 6. Cuatro dígitos son 10 000 combinaciones: se fuerzan tecleando. La comprobación de debilidad importa tanto como la aleatoriedad — un PIN aleatorio puede salir `111111`.

**`pin-cipher.service.ts`** — Cifra, descifra y calcula huellas. Dos claves distintas: `ACCESS_PIN_KEY` para AES-GCM y `ACCESS_PIN_FINGERPRINT_KEY` para el HMAC. Separarlas evita que comprometer la huella ayude a descifrar. **`decrypt()` se llama desde un solo punto de todo el código**: el endpoint que le muestra el PIN a su dueño.

**`credential.service.ts`** — Orquesta. `issue()` resuelve dispositivos por `(building_id, scope)`, pide el PIN, inserta la credencial y sus colocaciones en una transacción. `revoke()` marca la credencial y pasa las colocaciones a `pending_delete`. `reschedule()` cambia la vigencia sin tocar el PIN.

**`placement.service.ts`** — La cola. `claim(gatewayId, limit)` toma filas pendientes de los dispositivos de ese agente y sella `claimed_at`; `report()` aplica el resultado; un barrido libera los `claimed_at` vencidos. El arrendamiento evita ejecución doble si dos sondeos se solapan.

**`stay-composer.service.ts`** — Arma la respuesta del panel a partir de fuentes heterogéneas. **Cada bloque falla de forma independiente**: si openMAINT no responde, el huésped debe seguir viendo su PIN.

### Puntos de enganche en código existente

| Dónde | Qué añadir |
|---|---|
| `billing.service.ts` (webhook Hostaway) | Tras la facturación, crear o actualizar `guest_stay` y emitir credenciales. **En segundo plano y sin propagar errores**: el webhook responde `200 OK` siempre, y un fallo de accesos no puede romper la facturación. |
| `cleaning-tasks.service.ts` → asignación | Emitir credencial `employee` con vigencia `PlannedStartTime`/`PlannedEndTime`. |
| `cleaning-tasks.service.ts` → completar/cancelar | Revocar la credencial de la tarea. |
| `app.module.ts` | Registrar `AccessControlModule` y `GuestPortalModule`. |

El enganche de limpieza es el de mejor relación valor/esfuerzo del módulo: `CleaningTask` ya trae `PlannedStartTime`, `PlannedEndTime`, `Employee` y `phase`. Un PIN que **solo funciona durante la ventana de la tarea asignada** sale casi gratis del modelo existente, y sustituye la entrega de llaves.

---

## 9. Endpoints

### 9.1. Portal del huésped

Autenticación: JWT de huésped en `Authorization`. **Ninguna ruta lleva identificador de estancia** — la identidad sale siempre de la sesión.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/guest/session` | Canjea el token del enlace + apellido por un JWT de 30 min. Limitado por IP y por estancia. |
| `GET` | `/guest/me/stay` | Panel completo: estancia, unidad, estado, servicios. |
| `GET` | `/guest/me/credentials` | Lista de credenciales **con el PIN en claro**. Registra `pin_viewed` por cada PIN revelado. |
| `POST` | `/guest/me/incidents` | Reporte de avería. Crea un `CorrectiveMaint` en openMAINT. |
| `POST` | `/guest/me/vehicle` | Registro de placa. Solo si la entrada vehicular es ANPR — ver [17](#17-decisiones-abiertas). |

Respuesta de `GET /guest/me/stay`, con degradación por bloques:

```jsonc
{
  "stay": {
    "guestName": "Ana Pérez",
    "arrivalDate": "2026-09-14",
    "departureDate": "2026-09-18",
    "status": "active"
  },
  "unit": {                          // null si el listing no está mapeado
    "name": "Suite Azul 502",
    "building": "Torre A",
    "floor": "5"
  },
  "unitStatus": {                    // desde CleaningTask
    "cleaning": "completed",
    "readyForCheckIn": true
  },
  "services": {                      // null mientras no haya telemetría
    "temperature": null,
    "items": []
  },
  "access": [
    { "scope": "pedestrian", "status": "active",  "validTo": "2026-09-18T15:00:00-05:00" },
    { "scope": "vehicular",  "status": "pending", "validTo": "2026-09-18T15:00:00-05:00" }
  ],
  "degraded": ["services"]           // qué bloques no se pudieron resolver
}
```

El campo `degraded` es deliberado: el frontend necesita distinguir «no hay dato» de «no se pudo consultar», porque se pintan distinto. Los PINs no van aquí — exigen la llamada aparte que deja rastro.

### 9.2. Agente ↔ backend

Autenticación: `X-Gateway-Id` + `X-Gateway-Secret`, validados por `GatewayAuthGuard` contra `access_gateway.secret_hash`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/gateway/config` | Dispositivos asignados, con credenciales ISAPI descifradas. Actualiza `last_poll_at`. |
| `POST` | `/gateway/jobs/claim` | Reclama hasta `limit` colocaciones pendientes. Devuelve **el PIN en claro** solo para los `pending_write`. |
| `POST` | `/gateway/jobs/report` | Resultado por lote: `written`, `deleted` o `failed` con mensaje. |
| `POST` | `/gateway/events` | Lote de eventos de apertura. Idempotente por `dedupe_key`. |
| `POST` | `/gateway/inventory` | Instantánea de los usuarios de un dispositivo, para conciliar. |

> **El único momento en que un PIN sale del backend hacia el edificio es la respuesta de `/gateway/jobs/claim`.** Va sobre TLS, hacia un agente autenticado, y el agente lo usa y lo descarta sin escribirlo en disco. Ese es el punto que hay que revisar con más cuidado en cualquier auditoría.

### 9.3. Operación y soporte

Autenticación: sesión de openMAINT, restringida a roles de administración.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/access/credentials?subject=&status=` | Búsqueda. **Nunca devuelve el PIN.** |
| `POST` | `/access/credentials` | Alta manual (residente, proveedor). |
| `POST` | `/access/credentials/:id/revoke` | Revocación manual con motivo. |
| `POST` | `/access/credentials/:id/rotate` | Nuevo PIN conservando el vínculo. |
| `GET` | `/access/events?deviceId=&from=&to=` | Auditoría de aperturas. |
| `GET` | `/access/health` | Estado de agentes y dispositivos: latidos, colocaciones `failed`, saturación. |

`/access/health` es la pantalla que hay que mirar a diario. Un agente sin sondear no produce errores visibles: las puertas siguen abriendo con lo ya sincronizado, pero altas y revocaciones dejan de aplicarse **en silencio**.

---

## 10. El agente de la Raspberry

Proceso propio, independiente del backend NestJS. Lenguaje libre — Python encaja con lo que ya corre en la Pi. Se despliega como servicio systemd con reinicio automático.

### Bucle principal

```text
cada AGENT_POLL_SECONDS (30 por defecto):
    1. GET  /gateway/config          → refrescar dispositivos (cacheado)
    2. POST /gateway/jobs/claim      → tomar trabajos
    3. por cada trabajo:
         pending_write  → ISAPI: crear/actualizar usuario + PIN + vigencia
         pending_delete → ISAPI: borrar usuario
       registrar resultado en SQLite local
    4. POST /gateway/jobs/report     → reportar
    5. POST /gateway/events          → drenar buffer de eventos
    6. una vez al día: POST /gateway/inventory
```

### Estado local (SQLite)

Solo dos cosas, **ningún PIN**:

* **Buffer de eventos** pendientes de enviar. Es lo único irrecuperable si se pierde: el terminal acaba rotando su histórico.
* **Bitácora de trabajos** recientes, para diagnóstico sin depender de la nube.

El PIN llega en la respuesta de `claim`, se escribe en el terminal y **se descarta de memoria**. Nunca toca el disco de la Pi, ni sus logs.

### Recepción de eventos

Dos vías simultáneas, y hacen falta las dos:

1. **Empuje del terminal hacia el agente** (host receptor de eventos configurado en el equipo). Baja latencia; la Pi es local y siempre alcanzable.
2. **Consulta periódica del histórico** por rango de tiempo. Rellena lo que el empuje pierde en cada reinicio del terminal.

Solo con empuje se pierden eventos sin enterarse. Solo con consulta, la latencia sube a minutos. Juntas cubren ambos fallos.

### Reglas de robustez

* **Reintento con retroceso exponencial**, tope de intentos, y `failed` visible en el backend. Nunca un bucle infinito.
* **Idempotencia.** Reejecutar un `pending_write` debe dar el mismo resultado: escribir un usuario que ya existe es una actualización, no un error.
* **Reloj.** NTP más RTC con pila. Un terminal con la hora desviada acepta credenciales vencidas o rechaza válidas, y sella mal los eventos. El agente compara su hora con la del dispositivo en cada ciclo y **reporta la desviación como incidencia** si supera el umbral.
* **Sin puertos escuchando** hacia fuera del edificio, salvo el receptor de eventos, que solo escucha en la LAN.

---

## 11. Integración con Hikvision (ISAPI)

### 11.1. Advertencia previa

**ISAPI varía de forma significativa entre familias de producto y versiones de firmware.** Los nombres de recursos, los formatos de cuerpo y hasta la disponibilidad de una operación cambian entre modelos. Ninguna documentación genérica —incluida esta— sustituye la comprobación contra el equipo real.

Antes de escribir una línea del cliente ISAPI:

1. Obtener del equipo su listado de capacidades y su versión de firmware.
2. Ejecutar a mano el ciclo completo sobre **un terminal de pruebas**: alta de usuario con PIN y vigencia, verificación en la puerta, consulta, borrado.
3. Anotar longitud de PIN admitida, si el equipo exige PIN único entre usuarios, y el tope de usuarios del modelo.
4. **Solo entonces** fijar el modelo de datos definitivo.

Por eso el plan de la sección [16](#16-plan-de-implementación) pone la prueba de campo antes que las tablas: el esquema debe salir de lo que el equipo acepte, no al revés.

### 11.2. El espacio de nombres de `employeeNo`

ISAPI indexa usuarios por `employeeNo`, una cadena que es la clave primaria dentro del dispositivo. **Ese espacio es compartido** con todo lo cargado a mano por iVMS-4200, Hik-Connect o el propio teclado del equipo.

Esquema con prefijo reservado:

```text
DT4-G-<8 hex>   huésped
DT4-T-<8 hex>   residente
DT4-E-<8 hex>   personal
```

Tres consecuencias, y la tercera es la crítica:

1. El valor se deriva de `credential_placement.id` y es **estable**: reejecutar una escritura apunta al mismo registro.
2. El prefijo `DT4-` identifica **lo que creó este sistema**. Todo lo demás lo creó un humano.
3. **Nunca se borra un usuario sin el prefijo `DT4-`.** Un barrido «limpiador» que elimine lo desconocido deja fuera de su casa a residentes cargados manualmente. La conciliación los reporta; no los toca.

`employee_no` se guarda en `credential_placement` porque es lo único que permite borrar con precisión más tarde. Sin él, revocar sería adivinar.

### 11.3. Operaciones necesarias

| Operación | Cuándo | Notas |
|---|---|---|
| Alta/modificación de usuario con PIN y ventana de vigencia | `pending_write` | La vigencia se delega **al dispositivo**: es lo que hace que la puerta siga siendo correcta sin red. |
| Vinculación del usuario a la puerta y su plan horario | `pending_write` | Requiere que la puerta esté configurada para aceptar **PIN solo**. Si está en tarjeta+PIN, la credencial no sirve por sí sola. |
| Borrado de usuario | `pending_delete` | |
| Listado de usuarios | Conciliación | Paginado; en terminales llenos son miles de registros. |
| Consulta de eventos por rango | Recuperación de huecos | |
| Configuración del host receptor de eventos | Aprovisionamiento | Apunta al agente, en la LAN. |

Autenticación ISAPI: **Digest**. Credenciales distintas por dispositivo.

### 11.4. Límites que condicionan el diseño

**Capacidad.** Los terminales tienen tope de usuarios, variable según modelo. Los huéspedes rotan constantemente: si solo se deja expirar la ventana sin borrar el registro, el hueco sigue ocupado y en unos meses el equipo se llena y **rechaza altas nuevas**. La purga posterior al check-out no es higiene opcional, es un requisito funcional. `access_device.capacity_users` existe para alertar antes del límite.

**Formato del PIN.** Longitud admitida y unicidad obligatoria dependen del firmware. Si el equipo exige unicidad, hay que comprobarla contra el inventario conciliado además del índice de Postgres, o la escritura falla y el huésped llega a una puerta que no abre.

**Modo de autenticación por puerta.** Configuración del equipo, no del backend. Verificar en el aprovisionamiento de cada dispositivo.

---

## 12. Conciliación y purga

Dos barridos programados con `@Cron`, siguiendo el patrón de los planificadores existentes.

### 12.1. Conciliación

Existe porque hay **dos almacenes de verdad**. Alguien va a tocar un terminal por fuera del sistema — es cuestión de tiempo. Sin conciliación, cada fallo de red deja un PIN activo que el sistema cree revocado, y nadie se entera. Ese es el modo de fallo peligroso del módulo.

Nocturna, por dispositivo, cruzando el inventario reportado contra `credential_placement`:

| Situación | Diagnóstico | Acción |
|---|---|---|
| En Postgres como `written`, ausente del dispositivo | La escritura se perdió, o alguien lo borró a mano | Volver a `pending_write`. Se reescribe solo. |
| En el dispositivo con prefijo `DT4-`, sin fila en Postgres | Basura de una revocación fallida | Borrar del dispositivo. |
| En el dispositivo **sin** prefijo `DT4-` | Usuario cargado manualmente | **Reportar y no tocar.** |
| `written` en ambos, pero con vigencia distinta | Deriva de datos | Reescribir con el valor de Postgres. |

La tercera fila es la regla que protege a los residentes. La cuarta suele delatar un cambio de fechas que no llegó a aplicarse.

### 12.2. Purga

Diario. Recorre credenciales `expired` o `revoked` cuyas colocaciones sigan en `written`, las pasa a `pending_delete` y, cuando el agente confirma, marca la credencial `purged`.

A partir de ahí el PIN queda liberado, pero **no reutilizable de inmediato**: el enfriamiento de `ACCESS_PIN_COOLDOWN_DAYS` lo mantiene fuera del sorteo. El huésped anterior lo recuerda, y una cerradura no distingue memoria de autorización.

La purga alimenta además la alerta de saturación: si los usuarios de un dispositivo se acercan a `capacity_users`, hay que avisar antes de que empiece a rechazar altas.

---

## 13. Seguridad

### 13.1. El secreto compartido actual no basta

`IOT_WEBHOOK_SECRET` es **uno solo para toda la flota** (`iot-webhook.guard.ts`). Para alarmas es tolerable: el peor caso es un correctivo falso. Para puertas no: una Raspberry comprometida entrega el sistema entero y no hay forma de revocar un edificio sin revocarlos todos.

`access_gateway` con `secret_hash` y `secret_version` por dispositivo es **prerrequisito**, no mejora futura. El guard de alarmas puede migrar al mismo mecanismo después; no es urgente, pero conviene.

### 13.2. Los equipos Hikvision

Estos dispositivos arrastran un historial serio de vulnerabilidades explotadas de forma masiva. Medidas mínimas:

* **VLAN aislada.** Nunca expuestos a internet, ni por reenvío de puertos ni por UPnP.
* **Credencial de administración distinta por dispositivo.** Una compartida convierte un equipo comprometido en toda la flota.
* **Firmware al día**, con la advertencia de que una actualización puede alterar ISAPI: probar en el equipo de laboratorio antes de desplegar.
* Servicios innecesarios desactivados en el equipo.
* La VPN ayuda, **pero no sustituye el aislamiento**: dentro de la VPN el dispositivo sigue siendo alcanzable.

### 13.3. Manejo del PIN

| Regla | Motivo |
|---|---|
| Cifrado en reposo con clave fuera de `DATABASE_URL` | Un volcado de base de datos no debe rendir PINs |
| `decrypt()` en un único punto del código | Superficie auditable y mínima |
| Nunca en logs, ni en niveles de depuración | Los logs se agregan, se exportan y se conservan |
| Nunca en correo ni en mensaje de Hostaway | Se reenvían y se conservan años; el enlace caduca y deja rastro |
| Cada revelación registrada en `guest_portal_log` | Responder «¿quién lo vio?» ante una disputa |
| Nunca en las respuestas de operación (`/access/...`) | Soporte gestiona credenciales; no necesita verlas |

### 13.4. El reloj

La vigencia depende de la hora, y hay tres relojes: backend, agente y terminal.

Un terminal que arranca sin red con la hora equivocada acepta credenciales vencidas o rechaza válidas. NTP y RTC con pila en la Pi, sincronización del terminal desde el agente, y **desviación reportada como incidencia** al superar el umbral.

Ante hora no confiable, la política es **fallar cerrado**, con procedimiento manual documentado (portería, llave física). Es una decisión operativa consciente: un huésped que llama es un mal rato, una puerta que se abre sola es un incidente.

### 13.5. Peatonal no es igual que vehicular

La barrera vehicular normalmente exige **salida libre** por seguridad y normativa. Si el equipo falla, nadie puede quedar encerrado con su vehículo dentro. Salida *fail-safe*, entrada *fail-secure*. Es un requisito de instalación eléctrica, no de software, pero condiciona qué puede prometer el sistema y debe quedar por escrito.

### 13.6. Datos personales

`guest_stay` guarda nombre, correo y teléfono de personas que quizá no vuelvan nunca. Conviene fijar una política de retención: anonimizar `guest_name`, `guest_email` y `guest_phone` pasado un plazo del check-out, conservando la fila para la auditoría de accesos, que sí debe perdurar. La `display_name` denormalizada de `access_credential` mantiene legible el histórico sin necesidad del registro completo.

---

## 14. Variables de entorno

Añadir a `.env.example` siguiendo el formato existente, con secciones comentadas.

```env
# ── Portal del huésped ─────────────────────────────────────── [OBLIGATORIAS]
# Secreto de firma de los enlaces. Cadena larga y aleatoria, distinta de
# PASSWORD_RESET_SECRET. Rotarla invalida todos los enlaces vigentes.
GUEST_TOKEN_SECRET=

# Secreto del JWT de sesión del huésped, distinto del anterior.
GUEST_SESSION_SECRET=

# Duración de la sesión tras canjear el enlace.
GUEST_SESSION_TTL_MINUTES=30

# Margen de acceso antes de la llegada y después de la salida.
GUEST_ACCESS_LEAD_HOURS=3
GUEST_ACCESS_GRACE_HOURS=3

# Margen extra de validez del enlace sobre el fin del acceso, para que el
# huésped pueda consultar su estancia el día de salida.
GUEST_TOKEN_GRACE_HOURS=24

# ── Control de accesos ─────────────────────────────────────── [OBLIGATORIAS]
# Clave de cifrado de PINs (AES-256-GCM). 32 bytes en base64.
# Rotarla exige re-cifrar la tabla: no se cambia sin plan de migración.
ACCESS_PIN_KEY=

# Clave del HMAC de la huella. Distinta de la anterior.
ACCESS_PIN_FINGERPRINT_KEY=

# Clave de cifrado de las contraseñas ISAPI de los dispositivos.
ACCESS_DEVICE_KEY=

# Longitud del PIN. Mínimo 6: cuatro dígitos se fuerzan tecleando.
ACCESS_PIN_LENGTH=6

# Días antes de que un PIN liberado pueda reasignarse a otra persona.
ACCESS_PIN_COOLDOWN_DAYS=30

# Reintentos de escritura antes de marcar la colocación como failed.
ACCESS_MAX_ATTEMPTS=5

# Segundos que un agente retiene un trabajo reclamado antes de liberarse.
ACCESS_JOB_LEASE_SECONDS=120

# Minutos sin sondeo tras los cuales un agente se considera caído.
ACCESS_GATEWAY_STALE_MINUTES=15
```

Del lado del agente (fuera de este repositorio): `DT4FM_API_URL`, `GATEWAY_ID`, `GATEWAY_SECRET`, `AGENT_POLL_SECONDS`, `AGENT_CLOCK_SKEW_TOLERANCE_SECONDS`.

---

## 15. Migración de base de datos

Una sola migración con las siete tablas. Convención del repositorio: `src/database/migrations/<timestamp>-<Nombre>.ts`, clase `Nombre<timestamp>`, SQL en crudo por `queryRunner.query()`, y `down()` que deshace en orden inverso.

```
src/database/migrations/<timestamp>-CreateAccessControlTables.ts
```

Orden de creación, por dependencias:

```text
1. access_gateway
2. access_device            → FK gateway_id
3. guest_stay
4. access_credential        → FK guest_stay_id
5. credential_placement     → FK credential_id, device_id
6. access_event             → FK device_id, credential_id
7. guest_portal_log         → FK guest_stay_id
```

Puntos que no salen del generador de TypeORM y hay que escribir a mano:

* El **índice único parcial** de `access_credential` (`WHERE status IN ('pending','active')`).
* Los **CHECK** de los campos enumerados (`subject_type`, `scope`, `status`, `state`, `kind`, `event_type`). Se usa `text` con CHECK en vez de tipos enum de Postgres: añadir un valor a un enum es una migración incómoda, y estos conjuntos van a crecer.
* `ON DELETE RESTRICT` en `credential_placement.credential_id`. Deliberado: **una credencial no puede borrarse mientras siga escrita en un dispositivo**. La base de datos impone la invariante que el código podría olvidar.

Ejecución: `npm run migration:run`. Contra Neon usar `DATABASE_URL_DIRECT` (sin *pooler*), como documenta `docs/neon-postgres.md`.

---

## 16. Plan de implementación

Seis fases. El orden no es negociable en los dos primeros pasos: cambian requisitos de los siguientes.

### Fase 1 — Credencial por agente

Tabla `access_gateway`, `GatewayAuthGuard`, aprovisionamiento y rotación de secretos.

**Prerrequisito de todo lo demás.** Mientras el canal use un secreto único compartido, no se puede desplegar control de accesos sin aceptar que una Pi comprometida entrega la flota.

### Fase 2 — Prueba de campo con un terminal real

Sin backend de por medio. Un script contra **un** equipo: alta con PIN y vigencia, comprobación en la puerta, listado, borrado, recepción de un evento.

Sale de aquí: longitud de PIN admitida, si exige unicidad, tope de usuarios, forma real de los recursos ISAPI, formato de los eventos.

**Antes que el modelo de datos, a propósito.** El esquema debe salir de lo que el equipo acepta.

### Fase 3 — Núcleo del backend

Migración con las siete tablas, entidades, `PinGeneratorService`, `PinCipherService`, `CredentialService`, `PlacementService` y los endpoints de `/gateway`. Sin agente todavía: se prueba con peticiones simuladas.

Aquí encaja la prueba unitaria del generador (unicidad, enfriamiento, rechazo de PINs débiles) y del cifrador (ida y vuelta, detección de manipulación).

### Fase 4 — El agente

Bucle de sondeo, cliente ISAPI con lo aprendido en la fase 2, buffer de eventos, recepción por empuje y consulta de recuperación. Despliegue en **un edificio piloto**.

### Fase 5 — Emisión automática y mantenimiento

Enganche en el webhook de Hostaway y en el ciclo de `CleaningTask`. Conciliación nocturna, purga diaria, `/access/health`.

Aquí entra también el atributo `HostawayListingId` en `Unit` y el `UnitResolverService`. Puede adelantarse: es independiente y ya mejora el módulo de limpieza por sí solo.

### Fase 6 — Portal del huésped

`GuestTokenService`, `GuestSessionGuard`, `StayComposerService`, endpoints `/guest`, plantilla de correo y entrega por Hostaway. Frontend del panel.

**Va al final por dependencia, no por importancia**: sin credenciales emitidas y sincronizadas, el panel no tiene qué mostrar.

### Qué se puede entregar por separado

* Fases 1–2 son técnicas y no cambian nada visible.
* Fases 3–5 dan control de accesos **operable desde la administración**, sin portal: ya sustituyen la entrega de llaves al personal de limpieza.
* La fase 6 añade la cara visible para el huésped.

---

## 17. Decisiones abiertas

Ninguna bloquea la fase 1. Todas afectan al alcance de fases posteriores.

### 17.1. ¿La entrada vehicular tiene teclado o lee placas?

**La que más altera el alcance.** En Hikvision el acceso vehicular suele resolverse con lectura de placa (ANPR), tarjeta o mando, no con teclado.

* **Con teclado:** el modelo descrito aquí aplica tal cual, con `scope = 'vehicular'`.
* **Con ANPR:** no se emite un PIN, se gestiona una **lista de placas**. `access_credential` necesita una variante con `plate` en vez de PIN, y el panel pasa de «aquí está tu PIN» a «registra la placa de tu vehículo», con formulario, validación y su propio endpoint (`POST /guest/me/vehicle`, ya previsto en [9.1](#91-portal-del-huésped)).

Mientras no se resuelva, implementar solo el ámbito peatonal. El esquema admite ambos sin migración destructiva.

### 17.2. ¿Está el backend dentro de la VPN?

Este documento asume que **no**, y por eso el control lo inicia el agente. Si Render estuviera dentro, el empuje directo bajaría la latencia de revocación de minutos a segundos.

Aun así, la recomendación se mantiene: el sondeo sobrevive a más fallos y no acopla los despliegues a la red de los edificios.

### 17.3. Telemetría del panel

«Temperatura y funcionamiento de servicios» **no tiene fuente hoy**. La Raspberry emite alarmas discretas; no guarda lecturas.

Dos alcances posibles:

* **Estado instantáneo:** la Pi expone su última lectura y el backend la sirve tal cual. Suficiente para el panel, sin tabla nueva.
* **Histórico:** exige una tabla de series temporales y una política de retención. Es un módulo aparte, y no debería mezclarse con este.

Recomendación: instantáneo. El bloque `services` de la respuesta del panel ya está previsto y devuelve `null` mientras tanto.

### 17.4. Retención de datos personales

Ver [13.6](#136-datos-personales). Hay que fijar el plazo de anonimización de `guest_stay`.

### 17.5. Alta de residentes y personal

La emisión existe desde la fase 3, pero la pantalla de administración no está en el alcance. Hasta que exista, las altas manuales se hacen por `POST /access/credentials`.

---

## Referencias

* [Integración Hostaway → Contifico → openMAINT](../integracion%20hostaway%20contifico/README.md) — webhook y clase `HostawayInvoice`
* [Módulo de limpieza](../limpieza%20modulo/limpieza-modulo.md) — `CleaningTask` y su ciclo
* [Recuperación de contraseña](../password%20recovery%20module/password-recovery-module.md) — patrón del token firmado
* [Notificaciones push](../push-notifications%20module/push-notifications-module.md) — convenciones de tablas y repositorios
* [Alarmas IoT](../../../docs/integrations/openmaint-iot-alarms.md) — contrato actual con la Raspberry
* [Neon Postgres](../neon-postgres.md) — ejecución de migraciones
