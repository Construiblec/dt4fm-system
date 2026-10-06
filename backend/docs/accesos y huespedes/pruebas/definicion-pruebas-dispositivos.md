# Definición de pruebas — Gestión de PINes sobre dispositivos físicos

**Versión:** 1.0 · **Fecha:** 2026-09-28 

| Documento | Para qué |
|---|---|
| Este | Qué se prueba, con qué datos y qué resultado se exige |
| [ejecucion-pruebas-dispositivos.md](ejecucion-pruebas-dispositivos.md) | Cómo ejecutar cada prueba, paso a paso |
| [postman/](postman/) | Colección y fichas de edificio para Postman |

---

## 1. Propósito

Comprobar, **sobre las puertas reales**, que el ciclo de vida de un PIN gestionado por el backend
DT4FM llega a los terminales y se comporta como promete:

- una reserva de Hostaway emite el PIN y su cancelación lo revoca;
- el Supervisor CAV cambia el ámbito del PIN, lo renueva y abre puertas a distancia;
- el huésped abre y cierra la barrera vehicular desde su portal;
- la vigencia del terminal sigue a la de la reserva, y nada de lo anterior expone el PIN ni se
  deja usar sin autorización.

Las reservas no se esperan de Hostaway: se **simulan** enviando al webhook del backend un cuerpo
con el formato exacto del unified webhook (Anexo A).

## 2. Alcance

**Dentro.** Cuatro grupos de casos, ejecutados **por edificio** sobre cada edificio con control de
accesos. En esta campaña son Inglaterra y Pradera; cualquier otro se añade con su ficha (§3.2)
sin cambiar los casos.

| Grupo | Qué cubre |
|---|---|
| RES | Ciclo de la reserva: emisión, reenvío, modificación, vigencia, cancelación, cobertura |
| POR | Portal del huésped: apertura y cierre de la barrera |
| CAV | Supervisor CAV: ámbito del PIN, renovación, apertura y cierre remotos |
| SEG | Seguridad: autenticación, enlace revocado, roles, PIN no expuesto, límites de apertura |

**Fuera.**

- **`pin_conflict` forzado.** El PIN es aleatorio y no se puede elegir; lo cubre la suite E2E.
- **Resiliencia, conciliación nocturna y purga.** Requieren tirar un gateway o un terminal a
  propósito.
- **Auditoría de aperturas.** No existe todavía (D-13). La evidencia de cada apertura es la
  observación en sitio y la consola local del gateway, que registra el `actor` de cada orden.
- **Entrega del enlace por Hostaway o correo.** El enlace del portal se emite a mano (§5).

## 3. Entorno

```text
Postman / navegador ──▶ Backend staging (Render, rama develop)
                              │  Cloudflare Access · service token
                              ▼
                        VPS central  https://iot.construiblec.cloud
                              ▼
                        Gateway del edificio ──▶ Terminales Hikvision (peatonal, vehicular)
```

**Staging y producción comparten los terminales.** Todo PIN de prueba es un PIN real en una puerta
habitada hasta que se revoca, por eso la limpieza (§6) es obligatoria.

### 3.1 Configuración obligatoria de staging

Variables del servicio de staging en Render durante la ventana de prueba:

| Variable | Valor | Por qué |
|---|---|---|
| `ACCESS_IOT_USE_MOCK` | `false` | Con `true` las pruebas pasan sin tocar ninguna puerta |
| `ACCESS_IOT_URL` | `https://iot.construiblec.cloud` | Sin `https://` ninguna llamada sale |
| `ACCESS_IOT_TOKEN` | service token de Cloudflare | `<client-id>.access:<client-secret>` |
| `ACCESS_SCHEDULER_ENABLED` | **`false`** | Si staging lee el Hostaway real, su barrido de las 05:00 proyectaría las reservas reales y escribiría en las puertas PINes paralelos a los de producción |
| `ACCESS_REMOTE_OPEN_ENABLED` | `true` | Solo durante la ventana. Se devuelve a su valor al terminar |
| `GUEST_LINK_CHANNEL` | `none` | Ningún mensaje ni correo a un huésped real |
| `HOSTAWAY_WEBHOOK_USER` / `HOSTAWAY_WEBHOOK_SECRET` | definidas | Sin ellas el webhook responde `503` |
| `GUEST_MAGICLINK_SECRET` | definida | Sin ella no hay portal |
| `ACCESS_GUEST_LEAD_HOURS` / `ACCESS_GUEST_GRACE_HOURS` | se anotan | La colección necesita sus valores (`leadHours`, `graceHours`) |

### 3.2 Ficha de edificio

**Ningún caso nombra un edificio.** Todo lo específico está en su ficha, que en Postman es un
entorno (`postman/edificio-XXX.postman_environment.json`). Probar otro edificio es cambiar de
ficha.

| Parámetro | Qué es | De dónde sale |
|---|---|---|
| `buildingId` | `Building._id` de openMAINT | openMAINT |
| `buildingCode`, `buildingName` | Etiqueta legible | openMAINT |
| `buildingSeq` | Dos dígitos que separan sus ids de reserva (§5.2) | Se asigna: `01`, `02`, … |
| `listingId`, `listingName` | Un listing de Hostaway de una unidad del edificio | Atributo `Unit.HostawayListingID` en el openMAINT que usa staging |
| `checkInTime`, `checkOutTime` | Horas de ese listing | Hostaway. No todos usan 15/11: hay listings de Pradera con 16 |
| `tieneVehicular` | Si el edificio tiene barrera | `GET /v1/buildings` → `scopes` (petición P-07) |
| `devicesPeatonales`, `devicesVehiculares` | Todas sus puertas por ámbito | `GET /v1/devices` (petición P-08) |
| `deviceIdPeatonal`, `deviceIdVehicular` | La puerta concreta de las pruebas de apertura remota | Idem; se confirma en sitio cuál es cuál |

**Fichas de esta campaña:**

| Parámetro | Inglaterra | Pradera |
|---|---|---|
| `buildingId` | `3025058` | `3019998` |
| `buildingCode` | `ING` | `PRA` |
| `buildingSeq` | `01` | `02` |
| `listingId` | `439761` (I18, el del Anexo 1) | **Por completar** |
| `checkInTime` / `checkOutTime` | `15` / `11` (confirmar) | **Por confirmar** |
| Puertas y `tieneVehicular` | Se leen con P-07 y P-08 | Se leen con P-07 y P-08 |

**Casos que dependen de la barrera.** POR-01, POR-02, CAV-02, CAV-05 y SEG-05 solo se ejecutan si
`tieneVehicular = true`; si no, se registran como **N/A**. CAV-01 y POR-03 sí se ejecutan siempre,
en su variante negativa cuando no hay barrera.

## 4. Roles y cuentas

| Rol | Qué hace |
|---|---|
| **Operador** | Ejecuta Postman y las pantallas del panel CAV; registra resultados |
| **Observador en sitio** | Junto al teclado y la barrera del edificio. Marca los PINes, confirma aperturas y **vigila que no haya personas ni vehículos bajo la barrera** |
| **Huésped simulado** | El observador, con el portal abierto en su teléfono |

Operador y observador se mantienen en llamada durante toda la batería.

| Cuenta de openMAINT | Para qué |
|---|---|
| Rol `SuperUser` | Webhook y verificación en el backend, emisión del enlace del portal |
| Rol `SupervisorCAV` | Panel de autorizaciones y de puertas |
| Un rol sin permiso sobre accesos (p. ej. `MaintOffice`) | SEG-04 |

## 5. Datos de prueba

### 5.1 La reserva simulada

El cuerpo es el unified webhook de Hostaway del **Anexo 1** (Anexo A de este documento), íntegro.
Solo cambian estos campos:

| Campo | Valor en la prueba |
|---|---|
| `event` | `reservation.created` al crear; `reservation.updated` al modificar o cancelar |
| `data.id`, `data.hostawayReservationId` | Id ficticio (§5.2). **Nunca `66244571`**, que es una reserva real |
| `data.reservationId`, `data.channelReservationId` | `<listingMapId>-thread-prueba-<id>` |
| `data.listingMapId`, `data.listingName` | Los de la ficha del edificio; el listing de República en RES-07 |
| `data.guestName` | `Prueba DT4FM <código de edificio> <letra de reserva>` |
| `data.arrivalDate`, `data.departureDate` | Relativas al día de la prueba (§5.3) |
| `data.checkInTime`, `data.checkOutTime` | Los de la ficha, salvo en RES-05 |
| `data.status` | `new`, `modified`, `cancelled` o `inquiry`, según el caso |

**Datos personales anonimizados.** Nombre, cuenta de Airbnb, foto y hash del portal del Anexo 1
pertenecen a un huésped real; en el cuerpo de prueba se sustituyen por valores ficticios. La
estructura y los tipos no cambian.

El backend solo lee `id`, `hostawayReservationId`, `listingMapId`, `guestName`, `guestEmail`,
`phone`, `channelName`, `arrivalDate`, `departureDate`, `status`, `checkInTime` y `checkOutTime`, y
descarta el resto sin rechazarlo.

### 5.2 Ids de reserva

`99` + `buildingSeq` + `runSeq` (3 dígitos, uno por campaña) + número de reserva. Ejemplo:
reserva A de Inglaterra en la primera campaña, `99010011`. Así dos edificios pueden probarse el
mismo día y repetir una campaña no reutiliza estancias. Las reservas comunes usan `buildingSeq = 00`.

### 5.3 Reservas de la campaña

| Reserva | Ámbito | Llegada | Salida | Uso |
|---|---|---|---|---|
| **A** | Por edificio | Ayer | Dentro de 2 días | Flujo principal |
| **B** | Por edificio | Ayer | Dentro de 2 días, luego hoy con la hora ya pasada | Vencimiento |
| **C** | Común | Ayer | Dentro de 2 días | Edificio sin cobertura (República) |
| **D** | Común | Ayer | Dentro de 2 días | Estado `inquiry` |
| **E** | Común | Ayer | Dentro de 2 días | Webhook sin credenciales |

**La llegada es ayer a propósito.** El PIN vale desde el primer momento y la reserva queda fuera de
la ventana del barrido de reservas (hoy + 13 días), que cancelaría una reserva que no existe en
Hostaway.

### 5.4 Vigencia esperada

- Inicio: `arrivalDate` a la hora `checkInTime` (−05:00), menos `ACCESS_GUEST_LEAD_HOURS`.
- Fin: `departureDate` a la hora `checkOutTime` (−05:00), más `ACCESS_GUEST_GRACE_HOURS`.

La prueba no recalcula la fórmula: exige que la vigencia del terminal (VPS) sea **idéntica, al
segundo**, a la que guardó el backend.

## 6. Criterios

**Entrada** (por edificio): chequeos previos P-01 a P-08 en verde. El edificio aparece en
`/v1/health` con `gatewayOnline` y `operationsEnabled` en `true`, y todas sus puertas están en
línea. La configuración de §3.1 está aplicada, y el observador está en sitio.

**Suspensión:** una puerta vehicular que se abre sin respetar el detector de objetos, una apertura que no
se ordenó, o un PIN de prueba que no se puede revocar. Se detiene la batería de pruebas, se revoca lo que haya
y se avisa al equipo IoT.

**Salida:** todos los casos del edificio registrados como OK, FALLA o N/A con su evidencia.

**Limpieza:**
- toda reserva de prueba termina cancelada, y su credencial devuelve `404` en la VPS;
- `ACCESS_REMOTE_OPEN_ENABLED` vuelve a su valor anterior.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| La puerta vehicular abre sobre un vehículo o una persona | Observador presente, horario de poco tráfico, cierre solo con la zona despejada. El cierre remoto debe respetar el detector de presencia; si no lo hace, suspensión |
| Un PIN de prueba queda vivo en una puerta habitada | Limpieza obligatoria y verificada en la VPS |
| El PIN de prueba coincide con el de un huésped de producción | El terminal responde `pin_conflict` y el backend regenera solo |
| Molestia a residentes por aperturas | Aviso previo a conserjería; aperturas solo con el observador delante |
| Un resultado `uncertain` | Se registra como hallazgo; la puerta no se bloquea (D-18) |

## 8. Niveles de verificación

Cada caso se da por bueno en tres niveles, y **los tres tienen que coincidir**:

| Nivel | Qué se mira | Cómo |
|---|---|---|
| **Backend** | La intención: credencial, estado, ámbito, vigencia | V-01 (`GET /access/credentials`) y el portal (V-05) |
| **VPS** | Lo que hay hoy en los terminales, leído del aparato | V-02 (`GET /v1/credentials/{credentialId}`) |
| **Dispositivo** | La puerta | El observador marca el PIN o mira la puerta |

El `employeeNo` esperado en el terminal es `DT4` + `G` + los 8 primeros caracteres hex del
SHA-256 del `credentialId`, en mayúsculas (vector: `3f9a2b11-7c4e-4d2a-9b61-5e8f0a1c2d34` →
`DT4G688B2FCB`).

## 9. Catálogo de casos

Salvo que se diga lo contrario, "las puertas del ámbito" son **todas** las del edificio con ese
ámbito, no solo la primera.

### RES-01 · Una reserva nueva emite un PIN peatonal

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R1 |
| Precondición | Chequeos previos en verde; la reserva A no existe |
| Datos | Reserva A: `reservation.created`, `new` |
| Backend | Webhook `200 {received: true, processed: true}`. Una sola credencial viva: `active`, `synced`, `pedestrian`, con `employeeNo` esperado en cada puerta escrita |
| VPS | `state: written` en exactamente las puertas peatonales; `employeeNo` esperado; vigencia igual a la del backend |
| Portal | `pinState: disponible`, PIN de 4 dígitos, `hasVehicularAccess: false` |
| Dispositivo | El PIN abre cada puerta peatonal. Si hay barrera, el PIN **no** la abre |

### RES-02 · Reenviar la misma reserva no duplica nada

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R5 |
| Datos | El mismo cuerpo de RES-01 |
| Backend | `200 processed: true`. La misma credencial (mismo `id`), sigue siendo la única viva |
| Portal | El mismo PIN |
| Dispositivo | Sin acción |

### RES-03 · Modificar la salida mueve la vigencia sin cambiar el PIN

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R5 |
| Datos | Reserva A: `reservation.updated`, `modified`, salida un día más tarde |
| Backend | Misma credencial, `synced`, `validTo` nuevo |
| VPS | `validTo` de cada puerta = el nuevo del backend |
| Portal | El mismo PIN |
| Dispositivo | El PIN sigue abriendo |

### RES-04 · Antes del check-in el PIN no abre

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R5 |
| Datos | (a) Reserva A con la llegada movida a mañana. (b) La llegada devuelta a ayer |
| Backend | (a) Misma credencial, `validFrom` en el futuro, `synced` |
| VPS | (a) `validFrom` futuro en cada puerta, igual al del backend |
| Portal | (a) `pinState: antes-del-checkin`, `pin: null`. (b) `disponible`, el mismo PIN |
| Dispositivo | (a) El PIN —ya conocido— es **rechazado**. (b) Vuelve a abrir |

### RES-05 · Pasado el check-out el PIN no abre y el enlace deja de servir

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R5 |
| Datos | Reserva B: (a) crear; (b) `modified` con salida hoy y `checkOutTime` = hora actual − gracia − 1; (c) cancelar. (b) exige que la hora de Quito sea al menos gracia + 1 |
| Backend | (b) `validTo` en el pasado, `synced`. (c) `revoked`, `synced` |
| VPS | (b) `validTo` pasado en cada puerta, igual al del backend. (c) `404` |
| Portal | (b) El canje del enlace y `/guest/me` responden `401` |
| Dispositivo | (a) El PIN abre. (b) El PIN es **rechazado** |

### RES-06 · Cancelar la reserva revoca el PIN en todas las puertas

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R2 |
| Datos | Reserva A: `reservation.updated`, `cancelled` |
| Backend | `200 processed: true`. Credencial `revoked`, `revokedReason: reservation_cancelled`, `synced` |
| VPS | `404`: ninguna puerta la tiene |
| Dispositivo | El PIN es **rechazado** en todas las puertas donde estaba |

### RES-07 · Un edificio sin cobertura proyecta la estancia pero no emite PIN

| | |
|---|---|
| Ámbito · Barrera | Común · No |
| Requisito | R1 |
| Datos | Reserva C con un listing de República |
| Backend | `200 processed: true`. Ninguna credencial para la reserva |
| VPS | Nada que consultar |
| Portal | (Opcional, requiere el `stayId` de la base) `pinState: sin-cobertura` |

### RES-08 · Una consulta (`inquiry`) no es una reserva

| | |
|---|---|
| Ámbito · Barrera | Común · No |
| Requisito | R7 (lista blanca de estados) |
| Datos | Reserva D con `status: inquiry` |
| Backend | `200 processed: false`. Ninguna credencial ni estancia |

### RES-09 · La credencial solo llega a las puertas de su edificio

| | |
|---|---|
| Ámbito · Barrera | Por edificio (automático en cada V-02) · No |
| Requisito | R8 |
| VPS | Toda puerta que la VPS devuelve para la credencial pertenece al edificio de la ficha |
| Dispositivo | (Opcional) El PIN de la reserva A de un edificio es rechazado en el otro |

### POR-01 · El huésped abre la barrera desde su portal

| | |
|---|---|
| Ámbito · Barrera | Por edificio · **Sí** |
| Requisito | R3 |
| Precondición | CAV-01 hecho (ámbito peatonal + vehicular); zona de la barrera despejada |
| Acción | Portal → "Abrir puerta vehicular" |
| Backend | `200 outcome: opened`, `openUntil` ≈ ahora + 60 s |
| Portal | Aparece "Cerrar puerta vehicular" con la cuenta atrás |
| Dispositivo | La barrera sube. Un `uncertain` con la barrera arriba es un hallazgo: faltó la confirmación |

### POR-02 · El huésped cierra la barrera antes de que baje sola

| | |
|---|---|
| Ámbito · Barrera | Por edificio · **Sí** |
| Requisito | R3 |
| Precondición | POR-01 hace menos de 60 s, zona despejada |
| Backend | `200 outcome: closed` |
| Dispositivo | La barrera baja, respetando el detector de presencia |

### POR-03 · Sin acceso vehicular el portal no ofrece la barrera

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No (variante: edificio sin barrera) |
| Requisito | R3, R7 |
| Precondición | Credencial solo peatonal (tras CAV-02, o edificio sin barrera) |
| Portal | No aparece la sección "Puerta vehicular"; `canOpenVehicularGate: false` |
| Backend | `POST /guest/vehicular-gate/open` → `403` |
| Dispositivo | La barrera no se mueve |

### CAV-01 · El Supervisor CAV amplía el PIN a la barrera sin cambiarlo

| | |
|---|---|
| Ámbito · Barrera | Por edificio · Variante negativa sin barrera |
| Requisito | R4 |
| Acción | Autorizaciones → detalle → "Cambiar nivel de accesos" → marcar Vehicular → Confirmar |
| Backend | `200 accessLevel: both`. Misma credencial, `scope: both`, `synced` |
| VPS | Escrita en las puertas peatonales **y** vehiculares, mismo `employeeNo` |
| Portal | El mismo PIN, `hasVehicularAccess: true`, `canOpenVehicularGate: true` |
| Dispositivo | El PIN abre la barrera y sigue abriendo la peatonal |
| Variante sin barrera | `400` "no tiene entrada vehicular"; nada cambia |

### CAV-02 · Reducir el ámbito retira el PIN de la barrera

| | |
|---|---|
| Ámbito · Barrera | Por edificio · **Sí** |
| Requisito | R4 |
| Acción | "Cambiar nivel de accesos" → desmarcar Vehicular → Confirmar |
| Backend | `200 accessLevel: pedestrian`. Misma credencial, `synced` |
| VPS | Solo en las puertas peatonales |
| Portal | El mismo PIN, `hasVehicularAccess: false` |
| Dispositivo | El PIN es rechazado en la barrera y sigue abriendo la peatonal |
| Nota | Verifica una suposición del contrato: que el `PUT` de la VPS **retira** el registro de las puertas que salen del ámbito. Si la barrera sigue apareciendo en la VPS o sigue abriendo, es un hallazgo para IoT |

### CAV-03 · Renovar el PIN invalida el anterior

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R6 |
| Acción | Autorizaciones → detalle → "Renovar PIN" |
| Backend | `200`, sin el PIN en la respuesta. Misma credencial, `synced` |
| VPS | Mismo `employeeNo`, mismas puertas |
| Portal | PIN **distinto**, con el mismo enlace |
| Dispositivo | El PIN anterior es rechazado; el nuevo abre |

### CAV-04 · El Supervisor CAV abre la puerta peatonal a distancia

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R6 |
| Acción | Puertas → puerta peatonal → "Abrir" |
| Backend | `200 outcome: opened`; el panel muestra la orden con el usuario |
| Dispositivo | La puerta se destraba y vuelve a trabar sola |

### CAV-05 · El Supervisor CAV abre y cierra la barrera

| | |
|---|---|
| Ámbito · Barrera | Por edificio · **Sí** |
| Requisito | R6 |
| Acción | Puertas → barrera → "Abrir"; luego "Cerrar" antes de 60 s |
| Backend | `opened` y después `closed` |
| Dispositivo | La barrera sube y baja, respetando el detector de presencia |

### SEG-01 · El webhook exige sus credenciales

| | |
|---|---|
| Ámbito · Barrera | Común · No |
| Requisito | R7 |
| Datos | Reserva E, sin Basic Auth y con clave errónea |
| Backend | `401` en ambos casos. Ninguna credencial para la reserva E |

### SEG-02 · El enlace del portal muere con la reserva

| | |
|---|---|
| Ámbito · Barrera | Por edificio · No |
| Requisito | R7 |
| Precondición | RES-06 hecho |
| Backend | El canje del enlace corto y `/guest/me` responden `401`, con el mismo mensaje para cualquier causa |

### SEG-03 · El PIN no sale por ninguna respuesta salvo el portal

| | |
|---|---|
| Ámbito · Barrera | Por edificio (continuo) · No |
| Requisito | R7 (D-10) |
| Criterio | Ninguna respuesta, salvo `/guest/me`, contiene una clave `pin` o `pinCiphertext`, ni el valor del PIN vigente o del anterior como cadena. Lo comprueba el script de la colección en **cada** respuesta de la batería |

### SEG-04 · Solo los roles autorizados gestionan accesos

| | |
|---|---|
| Ámbito · Barrera | Común · No |
| Requisito | R7 |
| Backend | Autorizaciones sin sesión → `401`. Con un rol sin permiso → `403` en autorizaciones y en la apertura de puertas, sin mandar la orden. `GET /access/credentials` con sesión CAV → `403` (solo `SuperUser`) |

### SEG-05 · Dos toques seguidos no dan dos pulsos

| | |
|---|---|
| Ámbito · Barrera | Por edificio · **Sí** |
| Requisito | R7 (D-18) |
| Precondición | Justo después de POR-01, antes de 10 s |
| Backend | `429` con `retryAfterSeconds` |
| Dispositivo | La barrera recibe un solo pulso |

## 10. Trazabilidad

| Requisito | Casos |
|---|---|
| **R1** Una reserva de Hostaway emite el PIN en las puertas de su edificio | RES-01, RES-07 |
| **R2** La cancelación revoca el PIN de todas las puertas | RES-06 |
| **R3** El huésped abre y cierra la barrera desde su portal | POR-01, POR-02, POR-03 |
| **R4** El Supervisor CAV cambia el ámbito sin cambiar el PIN | CAV-01, CAV-02 |
| **R5** La vigencia del terminal sigue a la reserva; reenviar no duplica | RES-02, RES-03, RES-04, RES-05 |
| **R6** El Supervisor CAV renueva el PIN y abre o cierra puertas | CAV-03, CAV-04, CAV-05 |
| **R7** Seguridad | RES-08, SEG-01 a SEG-05 |
| **R8** Una credencial solo llega a su edificio | RES-09 |

| Decisión o regla | Casos |
|---|---|
| D-06 · `employeeNo` derivado del `credentialId`, sin reciclaje | RES-01, CAV-03 (mismo `employeeNo` con PIN nuevo) |
| D-07 · UTC por dentro, offset en el cable | RES-03, RES-04, RES-05 (vigencia del terminal = backend) |
| D-10 · El PIN en tránsito, nunca expuesto | SEG-03 |
| D-18 · Apertura remota de un toque | POR-01, POR-02, SEG-05, CAV-04, CAV-05 |
| Lista blanca de estados que emiten | RES-08 |
| Cambiar fechas o ámbito no cambia el PIN | RES-03, CAV-01, CAV-02 |

## 11. Registro de resultados

**Estado:** OK, FALLA o N/A (solo casos de barrera en un edificio sin ella). **Evidencia:**
- hora;
- `credentialId` o `requestId`;
- `X-Request-ID` si hubo error;
- foto o video de la puerta.

Para un edificio nuevo, se copia la tabla de un edificio con su nombre.

### Resultados — Inglaterra

**Fecha:** · **Operador:** · **Observador:** · **`runSeq`:**

| ID | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|
| RES-01 | PIN peatonal escrito y abre; no abre la barrera | | | |
| RES-02 | Misma credencial y mismo PIN | | | |
| CAV-01 | Mismo PIN, escrito en la barrera y la abre | | | |
| POR-01 | `opened`, la barrera sube | | | |
| SEG-05 | `429`, un solo pulso | | | |
| POR-02 | `closed`, la barrera baja | | | |
| CAV-05 | `opened` y `closed` desde el panel | | | |
| CAV-04 | `opened`, la peatonal se destraba | | | |
| CAV-03 | PIN nuevo abre, el anterior no | | | |
| CAV-02 | Retirado de la barrera, sigue en la peatonal | | | |
| POR-03 | Sin sección de barrera y `403` | | | |
| RES-03 | Mismo PIN, `validTo` nuevo en el terminal | | | |
| RES-04 | Rechazado antes del check-in; abre al restaurar | | | |
| RES-06 | `revoked`, `404` en la VPS, rechazado | | | |
| SEG-02 | `401` en el canje y en el portal | | | |
| RES-05 | Rechazado pasado el check-out; enlace `401` | | | |
| RES-09 | Solo puertas de este edificio | | | |
| SEG-03 | Ninguna respuesta expone el PIN | | | |

### Resultados — Pradera

**Fecha:** · **Operador:** · **Observador:** · **`runSeq`:**

| ID | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|
| RES-01 | PIN peatonal escrito y abre; no abre la barrera | | | |
| RES-02 | Misma credencial y mismo PIN | | | |
| CAV-01 | Mismo PIN, escrito en la barrera y la abre | | | |
| POR-01 | `opened`, la barrera sube | | | |
| SEG-05 | `429`, un solo pulso | | | |
| POR-02 | `closed`, la barrera baja | | | |
| CAV-05 | `opened` y `closed` desde el panel | | | |
| CAV-04 | `opened`, la peatonal se destraba | | | |
| CAV-03 | PIN nuevo abre, el anterior no | | | |
| CAV-02 | Retirado de la barrera, sigue en la peatonal | | | |
| POR-03 | Sin sección de barrera y `403` | | | |
| RES-03 | Mismo PIN, `validTo` nuevo en el terminal | | | |
| RES-04 | Rechazado antes del check-in; abre al restaurar | | | |
| RES-06 | `revoked`, `404` en la VPS, rechazado | | | |
| SEG-02 | `401` en el canje y en el portal | | | |
| RES-05 | Rechazado pasado el check-out; enlace `401` | | | |
| RES-09 | Solo puertas de este edificio | | | |
| SEG-03 | Ninguna respuesta expone el PIN | | | |

### Resultados — comunes

**Fecha:** · **Operador:**

| ID | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|
| RES-07 | Estancia sin credencial | | | |
| RES-08 | `processed: false`, nada creado | | | |
| SEG-01 | `401` sin credenciales y con clave errónea | | | |
| SEG-04 | `401` sin sesión, `403` con rol sin permiso | | | |

### Hallazgos

| ID | Edificio | Caso | Descripción | Severidad | Responsable |
|---|---|---|---|---|---|
| | | | | | |

---

## Anexo A — Cuerpo del webhook

El Anexo 1 íntegro. Las marcas `{{…}}` las rellena la colección (§5.1); los datos personales del
original están sustituidos por valores ficticios.

```json
{
    "object": "reservation",
    "event": "{{event}}",
    "accountId": 149703,
    "data": {
        "id": {{reservationId}},
        "listingMapId": {{listingMapId}},
        "listingName": "{{listingName}}",
        "channelId": 2018,
        "source": null,
        "channelName": "airbnbOfficial",
        "reservationId": "{{listingMapId}}-thread-prueba-{{reservationId}}",
        "hostawayReservationId": "{{reservationId}}",
        "channelReservationId": "{{listingMapId}}-thread-prueba-{{reservationId}}",
        "externalPropertyId": "0",
        "externalUnitId": null,
        "assigneeUserId": null,
        "customerIcalId": null,
        "customerIcalName": null,
        "guestAuthHash": "PRUEBA00",
        "guestPortalUrl": "https:\/\/guest-portal.hostaway.com\/{{reservationId}}\/PRUEBA00",
        "guestPortalRevampUrl": null,
        "isProcessed": 1,
        "isInitial": 0,
        "isManuallyChecked": 0,
        "isInstantBooked": 0,
        "reservationDate": "{{fechaAyer}} 12:00:00",
        "pendingExpireDate": "{{fechaHoy}} 12:00:00",
        "guestName": "{{guestName}}",
        "guestFirstName": "Prueba",
        "guestLastName": "DT4FM",
        "guestExternalAccountId": "000000000",
        "guestZipCode": null,
        "guestAddress": null,
        "guestCity": null,
        "guestCountry": null,
        "guestEmail": null,
        "guestPicture": null,
        "guestRecommendations": 0,
        "guestTrips": 0,
        "guestWork": null,
        "isGuestIdentityVerified": 0,
        "isGuestVerifiedByEmail": 0,
        "isGuestVerifiedByWorkEmail": 0,
        "isGuestVerifiedByFacebook": 0,
        "originalChannel": null,
        "isGuestVerifiedByGovernmentId": 0,
        "isGuestVerifiedByPhone": 0,
        "isGuestVerifiedByReviews": 0,
        "numberOfGuests": 2,
        "adults": 2,
        "children": 0,
        "infants": 0,
        "pets": null,
        "arrivalDate": "{{arrivalDate}}",
        "departureDate": "{{departureDate}}",
        "isDatesUnspecified": 0,
        "previousArrivalDate": null,
        "previousDepartureDate": null,
        "checkInTime": {{checkInTime}},
        "checkOutTime": {{checkOutTime}},
        "nights": 3,
        "phone": null,
        "totalPrice": 111,
        "remainingBalance": null,
        "taxAmount": 0,
        "channelCommissionAmount": null,
        "hostawayCommissionAmount": null,
        "cleaningFee": null,
        "securityDepositFee": null,
        "isPaid": null,
        "ccName": null,
        "ccNumber": null,
        "ccNumberEndingDigits": null,
        "ccExpirationYear": null,
        "ccExpirationMonth": null,
        "cvc": null,
        "stripeGuestId": null,
        "stripeMessage": null,
        "braintreeGuestId": null,
        "braintreeMessage": null,
        "currency": "USD",
        "status": "{{status}}",
        "paymentStatus": "paid",
        "cancellationDate": null,
        "cancelledBy": null,
        "hostNote": null,
        "guestNote": null,
        "doorCode": null,
        "doorCodeVendor": null,
        "doorCodeInstruction": null,
        "comment": null,
        "confirmationCode": null,
        "airbnbExpectedPayoutAmount": null,
        "airbnbListingBasePrice": null,
        "airbnbListingCancellationHostFee": null,
        "airbnbListingCancellationPayout": null,
        "airbnbListingCleaningFee": null,
        "airbnbListingHostFee": null,
        "airbnbListingSecurityPrice": null,
        "airbnbOccupancyTaxAmountPaidToHost": null,
        "airbnbTotalPaidAmount": null,
        "airbnbTransientOccupancyTaxPaidAmount": null,
        "airbnbCancellationPolicy": null,
        "bookingCancellationPolicy": null,
        "vrboCancellationPolicy": null,
        "marriottCancellationPolicy": null,
        "cancellationPolicyDetails": null,
        "isStarred": 0,
        "isArchived": 0,
        "isPinned": 0,
        "reservationCouponId": null,
        "customFieldValues": [],
        "reservationFees": [],
        "reservationUnit": [],
        "insertedOn": "{{fechaAyer}} 12:00:00",
        "updatedOn": "{{fechaHoy}} 08:00:00",
        "latestActivityOn": "{{fechaHoy}} 08:00:00",
        "customerUserId": null,
        "guestLocale": null,
        "localeForMessaging": null,
        "localeForMessagingSource": null,
        "listingCustomFields": [],
        "rentalAgreementFileUrl": null,
        "reservationAgreement": "not_required",
        "financeField": [
            {
                "id": 1,
                "accountId": 149703,
                "listingMapId": {{listingMapId}},
                "reservationId": {{reservationId}},
                "channelId": 2018,
                "units": 1,
                "isAddedByUser": 0,
                "guestInvoiceChargeId": null,
                "listingFeeSettingId": null,
                "type": "totals",
                "name": "airbnbPayoutSum",
                "title": "Airbnb payout sum",
                "alias": null,
                "appliedPer": "reservation",
                "applyTo": "null",
                "amount": 103.93,
                "amountType": "flat",
                "quantity": null,
                "value": 103.93,
                "previousValue": null,
                "jsonValue": 103.93,
                "isIncludedInTotalPrice": 0,
                "isOverriddenByUser": 0,
                "isMandatory": 0,
                "isQuantitySelectable": 0,
                "appearsIn": [],
                "displayInRent": 0,
                "lengthOfStayNights": null,
                "lengthOfStayAmount": null,
                "isUnique": 1,
                "isDeleted": 0,
                "insertedOn": "{{fechaAyer}} 12:00:00",
                "updatedOn": "{{fechaAyer}} 12:00:00",
                "previousListingFeeSettingId": null,
                "ageCondition": null,
                "total": 103.93
            },
            {
                "id": 2,
                "accountId": 149703,
                "listingMapId": {{listingMapId}},
                "reservationId": {{reservationId}},
                "channelId": 2018,
                "units": 1,
                "isAddedByUser": 0,
                "guestInvoiceChargeId": null,
                "listingFeeSettingId": null,
                "type": "accommodation",
                "name": "baseRate",
                "title": "Base rate",
                "alias": null,
                "appliedPer": "reservation",
                "applyTo": "null",
                "amount": 111,
                "amountType": "flat",
                "quantity": null,
                "value": 111,
                "previousValue": null,
                "jsonValue": 111,
                "isIncludedInTotalPrice": 1,
                "isOverriddenByUser": 0,
                "isMandatory": 1,
                "isQuantitySelectable": 0,
                "appearsIn": [],
                "displayInRent": 0,
                "lengthOfStayNights": null,
                "lengthOfStayAmount": null,
                "isUnique": 1,
                "isDeleted": 0,
                "insertedOn": "{{fechaAyer}} 12:00:00",
                "updatedOn": "{{fechaAyer}} 12:00:00",
                "previousListingFeeSettingId": null,
                "ageCondition": null,
                "total": 111
            },
            {
                "id": 3,
                "accountId": 149703,
                "listingMapId": {{listingMapId}},
                "reservationId": {{reservationId}},
                "channelId": 2018,
                "units": 1,
                "isAddedByUser": 0,
                "guestInvoiceChargeId": null,
                "listingFeeSettingId": null,
                "type": "totals",
                "name": "totalPriceFromChannel",
                "title": "Total price from channel",
                "alias": null,
                "appliedPer": null,
                "applyTo": null,
                "amount": null,
                "amountType": null,
                "quantity": null,
                "value": 111,
                "previousValue": null,
                "jsonValue": null,
                "isIncludedInTotalPrice": 0,
                "isOverriddenByUser": 0,
                "isMandatory": 0,
                "isQuantitySelectable": 0,
                "appearsIn": [],
                "displayInRent": 0,
                "lengthOfStayNights": null,
                "lengthOfStayAmount": null,
                "isUnique": 1,
                "isDeleted": 0,
                "insertedOn": "{{fechaAyer}} 12:00:00",
                "updatedOn": "{{fechaAyer}} 12:00:00",
                "previousListingFeeSettingId": null,
                "ageCondition": null,
                "total": 111
            }
        ],
        "guestPaymentCardIsVirtual": null,
        "insuranceStatus": "not_eligible",
        "claimStatus": null,
        "insurancePolicyId": null,
        "insuranceCoverageStart": null,
        "insuranceCoverageEnd": null,
        "cancellationPolicyId": 79387,
        "cancellationPolicy": "firm",
        "bookingcomSpecialRequests": null,
        "bookingcomSmokingPreference": null,
        "bookingcomIsGeniusMember": null,
        "bookingcomBookerName": null,
        "bookingcomBookerCompany": null,
        "bookingcomNoShowReportedAt": null,
        "bookingcomNoShowFeeWaived": null,
        "hostProxyEmail": null
    }
}
```
