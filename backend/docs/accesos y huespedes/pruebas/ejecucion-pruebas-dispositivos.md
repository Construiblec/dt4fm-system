# Ejecución de pruebas — Gestión de PINes sobre dispositivos físicos

Paso a paso de los casos definidos en
[definicion-pruebas-dispositivos.md](definicion-pruebas-dispositivos.md). Lo que se prueba en un
endpoint se hace con la colección de Postman de [postman/](postman/); lo que prueba una pantalla,
en la pantalla.

La batería se ejecuta **una vez por edificio** (§6 y §7, con su ficha) y **una vez por campaña**
para los casos comunes (§8).

---

## 0. Qué se necesita

| | |
|---|---|
| Personas | **Operador** (Postman y panel CAV) y **observador en sitio** (teclados y barrera), en llamada durante toda la batería |
| Cuentas de openMAINT | Una `SuperUser`, una `SupervisorCAV` y una con un rol sin permiso sobre accesos (p. ej. `MaintOffice`) |
| Accesos | Panel de Render del servicio de staging; service token de Cloudflare de la VPS; usuario y clave del webhook de staging |
| Teléfono | El del observador, para abrir el portal del huésped |
| Aviso | Conserjería del edificio avisada de que habrá aperturas de prueba |

## 1. Preparar Postman

1. **Importar** (*Import*) los cuatro archivos de `postman/`:
   - `dt4fm-pruebas-dispositivos.postman_collection.json`;
   - `edificio-ING.postman_environment.json`;
   - `edificio-PRA.postman_environment.json`;
   - `edificio-PLANTILLA.postman_environment.json`.
2. **Desactivar** *Settings → General → Automatically follow redirects*. Si Cloudflare rechaza el
   token responde un `302`. Con la opción activa, Postman lo sigue y muestra un `200` con HTML que
   parece un éxito.
3. **Abrir la consola** (*View → Show Postman Console*). Ahí salen el enlace del portal, el PIN
   vigente, el `employeeNo` y el estado de cada puerta.
4. **Rellenar las variables de la colección** (colección → *Variables*). Los secretos van **solo
   en *Current value***: el *Initial value* se sincroniza con la nube de Postman y viaja si se
   exporta.

   | Variable | Valor |
   |---|---|
   | `backendUrl` | URL del backend de staging en Render, sin barra final |
   | `frontendUrl` | `https://dt4fm-staging.vercel.app` |
   | `iotUrl` | `https://iot.construiblec.cloud` (**con `https://`**) |
   | `cfClientId` / `cfClientSecret` | Service token de Cloudflare. El Client ID termina en `.access` |
   | `webhookUser` / `webhookSecret` | `HOSTAWAY_WEBHOOK_USER` / `HOSTAWAY_WEBHOOK_SECRET` de staging |
   | `adminUser` / `adminPassword` | Cuenta `SuperUser` |
   | `cavUser` / `cavPassword` | Cuenta `SupervisorCAV` |
   | `otherUser` / `otherPassword` / `otherRole` | Cuenta y rol sin permiso sobre accesos |
   | `listingRep` | Listing de una unidad de República (§3) |
   | `runSeq` | `001` la primera campaña; se sube en cada campaña nueva (`002`, `003`…) |
   | `leadHours` / `graceHours` | `ACCESS_GUEST_LEAD_HOURS` / `ACCESS_GUEST_GRACE_HOURS` de staging |

**Cómo leer un resultado:** la pestaña *Test Results* de cada petición. Todo en verde es OK. Un
rojo dice qué no se cumplió. Las peticiones de barrera en un edificio sin ella se saltan solas y
lo dicen en la consola: eso es N/A.

## 2. Preparar staging

En Render, servicio de staging → *Environment*. Comprobar o fijar estos valores. Render
redespliega al guardar; esperar a que termine.

| Variable | Valor |
|---|---|
| `ACCESS_IOT_USE_MOCK` | `false` |
| `ACCESS_IOT_URL` | `https://iot.construiblec.cloud` |
| `ACCESS_IOT_TOKEN` | `<client-id>.access:<client-secret>` |
| `ACCESS_SCHEDULER_ENABLED` | **`false`** |
| `ACCESS_REMOTE_OPEN_ENABLED` | `true` (anotar el valor anterior para devolverlo) |
| `GUEST_LINK_CHANNEL` | `none` |
| `HOSTAWAY_WEBHOOK_USER` / `HOSTAWAY_WEBHOOK_SECRET` | Definidas |
| `GUEST_MAGICLINK_SECRET` | Definida |

`ACCESS_SCHEDULER_ENABLED` **tiene que estar en `false`**. Con los barridos encendidos, staging
proyectaría las reservas reales de Hostaway y escribiría en las puertas PINes paralelos a los de
producción.

## 3. Completar la ficha del edificio

En Postman, arriba a la derecha, seleccionar el entorno del edificio: *Edificio · Inglaterra
(ING)* o *Edificio · Pradera (PRA)*. Para un edificio nuevo, ver §10.

| Dato | Cómo obtenerlo |
|---|---|
| `buildingId`, `buildingCode`, `buildingName`, `buildingSeq` | Ya rellenos para ING y PRA |
| `listingId` | En openMAINT, clase **Unit**, filtrar por el edificio y leer el atributo **`HostawayListingID`** de cualquier unidad que lo tenga. Inglaterra ya trae `439761`; **Pradera hay que completarlo** |
| `listingName` | El nombre del listing en Hostaway (solo informativo) |
| `checkInTime` / `checkOutTime` | Las horas de ese listing en Hostaway. No todos usan 15/11 |
| `tieneVehicular` | Se rellena solo con **P-07** |
| `devicesPeatonales`, `devicesVehiculares`, `deviceIdPeatonal`, `deviceIdVehicular` | Se rellenan solos con **P-08**. Si el edificio tiene varias puertas peatonales, `deviceIdPeatonal` queda con la primera; se puede cambiar por la que se quiera abrir en CAV-04 |

`listingRep` (variable de la colección) se obtiene igual, con una unidad de República.

## 4. Chequeos previos

Con el entorno del edificio activo, ejecutar en orden la carpeta **00 Preparación**, de P-01 a
P-08. Se puede lanzar entera con *Run folder*. Todo en verde es el criterio de entrada.

| Petición | Si falla |
|---|---|
| P-01 | Staging caído, o sin el commit `2186d13`: revisar el despliegue |
| P-02 a P-04 | Credenciales o rol no asignado a la cuenta |
| P-05, P-06 | `gatewayOnline: false`: el gateway o su túnel no responde (la consola muestra el `errorCode`). `operationsEnabled: false`: el gateway aún no acepta operaciones. En los dos casos el edificio **no puede probarse**: avisar a IoT y pasar a otro edificio |
| P-06 | `301`: falta `https://` en `iotUrl`. `302`: token de Cloudflare rechazado. "El backend ve la misma VPS" en rojo: `ACCESS_IOT_USE_MOCK` sigue en `true` en staging |
| P-07, P-08 | Edificio fuera del catálogo o puertas fuera de línea: avisar a IoT |

El observador confirma en sitio qué puerta física corresponde a `deviceIdPeatonal` y cuál a
`deviceIdVehicular`. Los nombres salen en la consola tras P-08.

## 5. Cómo se verifica

Después de cada acción, el paso indica qué peticiones de **02 Verificación** ejecutar. Cada acción
deja anotado en el entorno lo que debe verse después, y la verificación lo comprueba sola.

| Petición | Nivel | Comprueba |
|---|---|---|
| **V-01** | Backend | Estado, ámbito y sincronización de la credencial; que sea la misma de antes; `employeeNo` esperado. Espera 3 s antes de leer |
| **V-02** | VPS | Que esté exactamente en las puertas del ámbito, con el `employeeNo` y la vigencia del backend, y solo en puertas de este edificio (RES-09) |
| **V-03** | Portal | Emite el enlace y lo imprime en la consola |
| **V-04** | Portal | Canjea el enlace corto, como hace el teléfono |
| **V-05** | Portal | `pinState`, PIN, acceso vehicular. Imprime el PIN vigente y comprueba si debía cambiar |

**En todas las respuestas**, un script de la colección comprueba que no aparezca el PIN (SEG-03).
Sale como una prueba más en *Test Results*.

"**Verificar completo**" significa ejecutar **V-01, V-02 y V-05**.

**Si V-01 dice `syncState = pending`**, esperar 10 s y volver a ejecutar V-01. Si sigue en
`pending`, mirar en la consola el `errorCode` de cada puerta y reenviar la acción, que es
idempotente: con los barridos apagados, staging no reintenta solo.

## 6. Recorrido por edificio — reserva A

En orden: cada paso parte del estado que dejó el anterior. Para cada paso, anotar en la tabla del
edificio de la definición (§11) el resultado y la evidencia.

### A1 · RES-01 — Crear la reserva

1. Postman: **01 › RES-01 Crear reserva A**.
2. Ejecutar **V-01, V-02, V-03, V-04, V-05**.
3. Enviar al observador, por un canal privado, el enlace que V-03 imprimió en la consola.
4. **En sitio:**
   - el observador abre el enlace en su teléfono y ve el PIN, que debe coincidir con el que
     V-05 imprimió en la consola;
   - lo marca en **cada** puerta peatonal: debe abrir;
   - si hay barrera, lo marca en su teclado: **no** debe abrir.
5. Registrar el `credentialId` y el `employeeNo` de la consola, la hora y un video de la apertura.

### A2 · RES-02 — Reenviar la misma reserva

1. Postman: **01 › RES-02 Reenviar reserva A (idéntica)**.
2. Ejecutar **V-01 y V-05**: misma credencial, mismo PIN.
3. En sitio: nada.

### A3 · CAV-01 — Ampliar el PIN a la barrera

1. **Panel** (con la cuenta `SupervisorCAV`), en `{{frontendUrl}}/supervisor-cav/autorizaciones`:
   1. abrir *Prueba DT4FM `<código>` A*;
   2. pulsar **Cambiar nivel de accesos**;
   3. dejar marcado **Acceso Peatonal**, marcar **Acceso Vehicular** y pulsar **Confirmar**.
2. Postman: **04 › CAV-01 Ampliar a peatonal + vehicular**. No repite la escritura, porque el
   ámbito ya es el pedido, y deja anotado lo que la verificación debe esperar.
3. Ejecutar el **verificar completo**: mismo PIN, ahora también en la barrera.
4. **En sitio:** el PIN abre la barrera y sigue abriendo la peatonal.
5. **Sin barrera:** el panel muestra el error, y CAV-01 en Postman espera un `400` "no tiene
   entrada vehicular". Registrar la variante y saltar a A6.

### A4 · POR-01, POR-02 y SEG-05 — Barrera desde el portal

Zona de la barrera despejada; el observador la vigila durante todo el paso.

1. **Desde el teléfono (POR-01):** recargar el portal y pulsar **Abrir puerta vehicular**. La
   barrera sube, y el portal muestra **Cerrar puerta vehicular** con una cuenta atrás.
2. **Desde el teléfono (POR-02):** antes de que termine la cuenta atrás, pulsar **Cerrar puerta
   vehicular**. La barrera baja.
3. Esperar al menos 10 s. Postman: **03 › POR-01 Abrir la barrera** e, **inmediatamente**,
   **03 › SEG-05 Abrir otra vez antes de 10 s**.
   - POR-01: `opened`, la barrera sube.
   - SEG-05: `429`, y la barrera **no** recibe un segundo pulso.
4. Postman: **03 › POR-02 Cerrar la barrera (dentro del minuto)**: `closed`, la barrera baja.
5. Un resultado `uncertain` se registra como hallazgo, con la hora y el `requestId` que aparece
   en el cuerpo de la petición.

### A5 · CAV-05 — Barrera desde el panel

1. **Panel**, en `{{frontendUrl}}/supervisor-cav/puertas`: en la barrera, **Abrir**. Esperar a que
   suba y pulsar **Cerrar**. Alternativa: **04 › CAV-05a** y **CAV-05b** en Postman.
2. **En sitio:** sube y baja.
3. Postman: **04 › CAV-04a Listar las puertas**. La consola muestra la última orden de la barrera
   con el usuario CAV.

### A6 · CAV-04 — Puerta peatonal desde el panel

1. **Panel**, en *Puertas*: en la puerta peatonal, **Abrir**. Alternativa: **04 › CAV-04b**.
2. **En sitio:** se destraba y vuelve a trabar sola. El observador confirma que es la puerta que
   la ficha llama `deviceIdPeatonal`.

### A7 · CAV-03 — Renovar el PIN

1. Antes de renovar, anotar el PIN vigente: es el último que imprimió V-05.
2. **Panel**, en *Autorizaciones* → detalle de la reserva A: **Renovar PIN**.
3. Postman: **04 › CAV-03b Registrar una renovación hecha desde el panel**. Si la renovación se
   hace desde Postman con **CAV-03**, no ejecutar CAV-03b.
4. Ejecutar el **verificar completo**: misma credencial y mismo `employeeNo`. V-05 exige un PIN
   **distinto** y lo imprime.
5. **En sitio:** el PIN anterior es **rechazado**; el nuevo abre la peatonal y, si la hay, la
   barrera.

### A8 · CAV-02 — Reducir el PIN a peatonal

1. **Panel**: **Cambiar nivel de accesos** → desmarcar **Acceso Vehicular** → **Confirmar**.
2. Postman: **04 › CAV-02 Reducir a peatonal** (idempotente; deja anotada la expectativa).
3. Ejecutar el **verificar completo**. V-02 exige que la barrera **ya no** aparezca.
4. **En sitio:** el PIN es **rechazado** en la barrera y sigue abriendo la peatonal.
5. Si la barrera sigue en V-02 o sigue abriendo, es un **hallazgo para IoT**: el `PUT` de la VPS
   no retira el registro de las puertas que salen del ámbito.
6. **Sin barrera:** N/A.

### A9 · POR-03 — Sin acceso vehicular

1. **Teléfono:** recargar el portal. La sección *Puerta vehicular* ya no aparece.
2. Postman: **03 › POR-03 Abrir sin acceso vehicular** → `403`. La barrera no se mueve.

### A10 · RES-03 — Modificar la salida

1. Postman: **01 › RES-03 Modificar salida de A (+1 día)**.
2. Ejecutar el **verificar completo**: misma credencial, mismo PIN. V-02 comprueba que el terminal
   tiene la nueva `validTo`.
3. En sitio (opcional): el PIN sigue abriendo.

### A11 · RES-04 — Antes del check-in

1. Postman: **01 › RES-04a Mover la llegada de A a mañana**.
2. Ejecutar el **verificar completo**. V-05 espera `antes-del-checkin` y sin PIN.
3. **En sitio:** el PIN vigente (el de A7) es **rechazado**.
4. Postman: **01 › RES-04b Devolver la llegada de A a ayer**.
5. Ejecutar el **verificar completo**: `disponible` y el mismo PIN.
6. **En sitio:** el PIN vuelve a abrir.

### A12 · RES-06 — Cancelar la reserva

1. Postman: **01 › RES-06 Cancelar reserva A**.
2. Ejecutar **V-01 y V-02**. V-01 espera `revoked`, y V-02 espera `404`.
3. **En sitio:** el PIN es **rechazado** en todas las puertas donde estaba.

### A13 · SEG-02 — El enlace muere con la reserva

1. Ejecutar **V-04 y V-05**: `401` en ambos.
2. **Teléfono:** recargar el portal. Debe decir que el enlace no es válido.

## 7. Recorrido por edificio — reserva B

**RES-05** exige que la hora de Quito sea al menos `graceHours + 1`. Si no, la petición se detiene
y lo avisa.

1. Postman: **01 › RES-05a Crear reserva B**. Ejecutar **V-01, V-02, V-03, V-04, V-05**.
2. **En sitio:** el PIN de B abre la peatonal.
3. Postman: **01 › RES-05b Vencer reserva B**. Deja la salida hoy, una hora antes de ahora
   contando la gracia.
4. Ejecutar **V-01 y V-02**: la vigencia del terminal ya terminó y coincide con la del backend.
5. **En sitio:** el PIN de B es **rechazado**.
6. Ejecutar **V-04 y V-05**: `401`, porque el enlace venció con el acceso.
7. Postman: **01 › RES-05c Cancelar reserva B**. Ejecutar **V-01 y V-02**: `revoked` y `404`.

Con esto, el edificio está terminado y limpio. Repetir desde §3 con el siguiente edificio.

## 8. Recorrido común

Una vez por campaña, con cualquier entorno de edificio activo.

### C1 · SEG-01 — Webhook sin credenciales

1. Postman: **05 › SEG-01a Webhook sin credenciales** → `401`.
2. Postman: **05 › SEG-01b Webhook con clave errónea** → `401`.
3. Ejecutar **V-01**: no existe credencial para la reserva E.

### C2 · RES-07 — Edificio sin cobertura

1. Postman: **01 › RES-07 (común) Reserva C en edificio sin cobertura** → `processed: true`.
2. Ejecutar **V-01**: ninguna credencial. V-02 y el portal se saltan solos.
3. Opcional: comprobar que el portal muestra "sin cobertura".
   1. Buscar el `stayId` en la base de staging:
      `SELECT id FROM guest_stay WHERE hostaway_reservation_id = '<resC>'`.
   2. Ponerlo en `stayId` y ejecutar V-03 y V-04.
   3. En la respuesta de V-05 mirar solo que `pinState` sea `sin-cobertura`. Sus aserciones no
      aplican a este caso.
4. Postman: **01 › RES-07b (común) Cancelar reserva C**.

### C3 · RES-08 — Consulta (`inquiry`)

1. Postman: **01 › RES-08 (común) Reserva D en consulta (inquiry)** → `processed: false`.
2. Ejecutar **V-01**: ninguna credencial.

### C4 · SEG-04 — Roles

Requiere haber ejecutado **P-04**.

1. Postman: **05 › SEG-04a Autorizaciones sin sesión** → `401`.
2. **05 › SEG-04b Autorizaciones con rol sin permiso** → `403`.
3. **05 › SEG-04c Abrir una puerta con rol sin permiso** → `403`. **En sitio:** la puerta no se
   mueve.
4. **05 › SEG-04d Credenciales (solo SuperUser) con sesión CAV** → `403`.

## 9. Limpieza

Al terminar cada edificio, o si la batería se interrumpe:

1. Si la reserva A o la B quedaron vivas, ejecutar **RES-06** o **RES-05c** y después **V-01 y
   V-02**: `revoked` y `404`.
2. La reserva C se cancela en C2; D y E nunca crean credencial.
3. En Render, devolver `ACCESS_REMOTE_OPEN_ENABLED` a su valor anterior.
4. En Postman, **no exportar ni compartir** los entornos con sus valores actuales: guardan tokens
   de sesión, el enlace del huésped y el último PIN.
5. Para la próxima campaña, subir `runSeq`.

## 10. Añadir un edificio

1. En Postman, duplicar *Edificio · PLANTILLA* y renombrarlo con el edificio.
2. Rellenar `buildingId`, `buildingCode`, `buildingName` y un `buildingSeq` que no use otro
   edificio (`03`, `04`…).
3. Completar la ficha (§3), ejecutar los chequeos previos (§4) y los recorridos de §6 y §7.
4. En la definición, copiar una tabla de resultados de edificio con su nombre.

La colección no cambia: no contiene ningún dato de edificio.

## 11. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `301` desde la VPS | `iotUrl` sin `https://` | Corregir la variable |
| `302` desde la VPS | Service token rechazado; Client ID sin `.access` | Revisar `cfClientId` / `cfClientSecret` |
| Webhook `503` | Faltan `HOSTAWAY_WEBHOOK_USER` / `SECRET` en staging | Configurarlas en Render |
| Webhook `401` fuera de SEG-01 | `webhookUser` / `webhookSecret` no coinciden con staging | Corregir las variables |
| Webhook `processed: false` fuera de RES-08 | El cuerpo no pasó la validación, o un error `4xx` del backend | Logs de staging en Render: el motivo aparece en el mensaje "Reserva … descartada" |
| V-01 sin credencial tras RES-01 | El listing no está mapeado a una unidad del edificio en openMAINT, o el edificio no está en `/v1/buildings` | Logs: "sin edificio resuelto" o "no tiene control de accesos". Revisar `listingId` |
| V-01 en `pending` que no avanza | Puerta o gateway `unreachable` | Consola: `errorCode` por puerta. Reenviar la acción cuando IoT confirme |
| V-01 en `failed` | `invalid_request`, `gateway_rejected`, `device_full`, `no_devices_in_scope` | Hallazgo. Ver el código en los logs de staging |
| V-02 con puertas de más o de menos | Registro que no se retiró, o puerta ausente | Hallazgo para IoT, con la salida de la consola |
| VPS dice `written` pero el teclado rechaza el PIN | Reloj del terminal, vigencia o modo del teclado | Ver `clockSkewSeconds` en P-08 y la vigencia en V-02 |
| Apertura `503` | `ACCESS_REMOTE_OPEN_ENABLED` apagado en staging, o `remote_open_disabled` en el gateway | Revisar Render; si es el gateway, avisar a IoT |
| Apertura `uncertain` | La orden salió y el terminal no confirmó | Hallazgo, con hora y `requestId`. No repetir sin el observador |
| `429` inesperado | Menos de 10 s desde la orden anterior sobre la misma puerta | Esperar y repetir |
| V-04 / V-05 `401` inesperado | Enlace de otra reserva | Ejecutar V-01 y V-03 de nuevo |
