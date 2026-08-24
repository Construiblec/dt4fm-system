# Módulo de Supervisión de Mantenimiento

Panel del rol `SupervisorMantenimiento`: ver todos los correctivos y preventivos, asignarles
cesionario, rechazarlos, reasignar dentro del mismo equipo y revisar los cierres.

Hasta ahora el despacho de trabajo se hacía a mano dentro de openMAINT. En la instancia hay
**364 preventivos en planificación sin cesionario** y **9 correctivos parados en asignación**.

---

## 1. Por qué existe un gateway nuevo de `CorrectiveMaint`

El módulo de incidentes solo sabe **crear** (`CM01-Opening`) y **cerrar** (`CM03-Advance`) — sin
filtros compuestos, sin paginación, sin constantes de estado y sin verificar que el avance haya
ocurrido. `corrective-maint.openmaint.service.ts` replica la estructura del gateway preventivo,
incluidas sus dos trampas ya documentadas de CMDBuild:

- En endpoints de **procesos** el `and`/`or` va **dentro** de `attribute`
  (`{attribute:{and:[…]}}`). La forma inversa devuelve un 500.
- `equal` con varios valores **no** funciona como `IN`: hay que componer un `or`.

Y una tercera, descubierta aquí: **un filtro `{and: []}` vacío también rompe**, así que
`buildFilter` devuelve `{}` cuando no hay condiciones.

Para «con / sin cesionario» se usan los operadores `isnull` / `isnotnull`, verificados contra la
instancia (17 sin cesionario + 14 con = 31 correctivos).

---

## 2. Permisos: qué hace falta en openMAINT

El grupo `SupervisorMantenimiento` (id `7882034`, `admin_limited`) necesita:

| Recurso | Modo | Estado |
|---|---|---|
| `CorrectiveMaint`, `PreventiveMaint`, `MaintProcess`, `Process`, `IncidenciaTPM` | `wf_plus` | ✅ concedido |
| `Employee` (+ subclases) | `read` | ✅ concedido |
| `Team`, `Company` | — | ❌ **no hace falta** |

`Team` no se necesita porque la ficha de `Employee` ya trae `Team` (id numérico), `_Team_code` y
`_Team_description` resueltos: la lista de equipos del selector se **deriva de los empleados**.

### ✅ El performer no es el supervisor, pero `wf_plus` basta

Los pasos del flujo tienen como *performer* a `MaintOffice` (PM01, CM02, CM05, CM07), `Team`
(CM03) y `Supplier` (CM04) — **nunca `SupervisorMantenimiento`**.

**Verificado contra el clon el 2026-08-21** con la sesión de un usuario del grupo: el `_tasklist`
de una actividad cuyo performer es `MaintOffice` llega con `writable: true`, y las tres
transiciones se aplicaron de verdad sobre `CM.2026.0126`:

| Acción | Resultado |
|---|---|
| `CM02-Advance` | Asignación → Ejecución ✅ |
| `CM03-Advance` | Ejecución → Contabilidad ✅ |
| `CM05-Back` | Contabilidad → Asignación ✅ |

**No hace falta tocar los performers en el diseñador de procesos.**

Aun así, la comprobación de estado se mantiene: **openMAINT responde 200 a un `_advance` aunque no
avance** —guarda los atributos y deja el proceso donde estaba—, así que toda escritura **relee la
tarjeta y verifica** (`assertCorrectiveReached` / `assertPreventiveReached`). Sin eso la UI le
diría al supervisor que asignó un trabajo que sigue sin asignar.

> Dato útil del mismo ensayo: `CM05-Back` **limpia `ExecStartDate` y `ExpExecStartDate`, pero
> conserva el `Assignee`**. Un correctivo devuelto de revisión queda en Asignación con cesionario.

### Devolver un correctivo tiene dos consecuencias que conviene tener presentes

**Se pierden las horas del intento anterior.** `CM05-Back` borra `ExecStartDate` y `ExecEndDate`, y
no se pueden reponer: el paso `CM02-Assignment` **ni siquiera declara esos atributos** (sí
`ExpExecStartDate`, `Assignee`, `Team`). Lo único que sobrevive del intento fallido es el motivo del
rechazo, que se escribe en la bitácora del proceso. Si hiciera falta conservar la duración habría
que registrarla ahí explícitamente al devolver.

**Hay que volver a asignarlo, no solo reasignarlo.** Como el `Assignee` sobrevive, es tentador
ofrecer «Reasignar» — pero eso es un `saveFields` que cambia el campo **sin avanzar el flujo**, y el
correctivo se queda en Asignación para siempre: el técnico lo ve bloqueado y nunca puede arrancarlo.
La acción correcta es `CM02-Advance` otra vez, **incluso hacia la misma persona**, que es lo normal
cuando se pide repetir el trabajo. Por eso la vista ofrece «Asignar» según el **estado**, no según
si hay cesionario, y «Reasignar» solo una vez despachado.

Comprobado de punta a punta el 2026-08-24 sobre `CM.2026.0140`:
asignar → iniciar → finalizar (duración registrada) → rechazar (fechas borradas) → **asignar de
nuevo al mismo cesionario** → vuelve a «Asignado» y el técnico puede arrancarlo.

---

## 3. Estados y acciones (IDs verificados)

### `CorrectiveMaint` — 9 estados

`CM-Opening` 277461 · `CM-Assignment` 277462 · `CM-Management` 279295 · `CM-Estimate` 279317 ·
`CM-Control` 388244 · `CM-Execution` 277463 · `CM-Accounting` 279373 · `CM-Completed` 277464 ·
`CM-Canceled` 280086

### Acciones (`Process - Action`)

| Acción | ID | Qué hace |
|---|---|---|
| `CM02-Advance` | 261333 | Assign to team |
| `CM02-Reject` | 261334 | Reject and close |
| `CM03-Advance` | 261335 | Conclude activity |
| `CM05-Advance` | 280088 | **Approve** |
| `CM05-Back` | 280089 | **Back to assignment** |
| `PM01-Advance` | 278763 | Start maintenance (Planificación → Asignación) |

Hay que mandar el **ID numérico**: con el código openMAINT guarda `Action: null` y aplica la
transición por defecto del paso.

### Atributos escribibles por paso

| Paso | Escribibles de interés |
|---|---|
| `CM02-Assignment` | **Assignee, Team, ExpExecStartDate**, ProcessNotes |
| `CM03-Execution` | Assignee, ExecStartDate, ExecEndDate |
| `CM07-Management` | Assignee, Team |
| `PM01-Opening` | **Assignee** |
| `PM02-Assignment` | **Assignee, ExpExecStartDate** |
| `PM03` / `PM04` | Assignee |

> **`Team` no es escribible en NINGÚN paso de `PreventiveMaint`.** En preventivos solo se asigna la
> persona; el equipo lo define el plan. El DTO acepta `teamId` por simetría pero el servicio lo
> ignora y lo registra en el log.

### El inicio previsto se fija en un solo sitio, y es obligatorio

`ExpExecStartDate` se pone desde **«Planificar inicio de ejecución»**, y solo desde ahí. El modal de
asignación llegó a tener su propio campo —era «la última oportunidad» antes de que CM02 lo
bloqueara— pero eso dejaba **dos formularios para el mismo dato**, con dos formatos y dos sitios
donde equivocarse.

No se pierde nada: `updatePlannedStart` escribe en CM02, el mismo paso donde vive «Asignar», así que
basta con planificar antes de asignar.

**`assignCorrective` lo exige**: si no viene en el DTO ni está ya en la tarjeta, responde **400**. Es
la única oportunidad — pasado CM02 el campo queda bloqueado y el correctivo se quedaría sin
planificar para siempre. En la UI, «Asignar cesionario» aparece deshabilitado con un atajo al panel
de planificación.

> **En preventivo no se puede exigir lo mismo**, y no es un descuido: `PM02-Advance` va de
> Planificación a **Aceptación**, y `ExpExecStartDate` solo es escribible en Aceptación — o sea,
> *después* de asignar. Exigirlo al asignar dejaría el preventivo en un callejón sin salida.

`AssignAssigneeDto` sigue aceptando `plannedStart` —la API no se recorta por un cambio de
pantalla—, simplemente la UI ya no lo manda: cuando llega, vale como fecha y la asignación pasa.

Comprobado contra el clon el 2026-08-24: asignar sin fecha da 400 y **deja el correctivo intacto**;
planificar y luego asignar da 201; y mandar `plannedStart` en el DTO también.

> **Formato de fecha.** `<input type="date">` y `datetime-local` se pintan según el idioma del
> **navegador**, no el de la página: con Chrome en inglés salía `mm/dd/yyyy`, y no hay atributo ni
> CSS que lo cambie. Por eso el calendario es propio (`shared/components/DateField.tsx`) y garantiza
> `dd/mm/aaaa`. La hora sigue siendo un `<input type="time">` nativo, que no es ambiguo.
> Los helpers de conversión están en `shared/utils/dateTimeInput.ts`.

---

## 4. El estado derivado «Asignado»

`CorrectiveMaint` **no tiene** un estado «asignado pero no iniciado»: `CM02-Advance` lleva la
instancia directamente a `CM-Execution`, y openMAINT rellena `ExecStartDate` copiando la fecha
*prevista*. El técnico vería una hora de inicio que no puso.

**Confirmado en el clon**: tras un `CM02-Advance` con `ExpExecStartDate` a las 10:00, la tarjeta
vuelve con `ExecStartDate` en esas mismas 10:00, sin haberlo enviado. Lo mismo en las cinco
instancias que ya estaban en Ejecución: en todas `ExecStartDate === ExpExecStartDate`.

Por eso no basta con derivarlo en el mapeo. `assignCorrective` **vacía el campo** con un
`saveFields` justo después de que el avance se confirme (`clearAutoFilledExecStart`) — se verificó
que `ExecStartDate` se puede poner a `null` y reescribir por API en `CM03-Execution`. Recién
entonces `toCorrective` puede exponer `statusCode: "Assigned"` cuando el estado es `Execution` y no
hay `ExecStartDate`.

El vaciado es **best-effort a propósito**: la asignación ya se aplicó, así que un fallo al limpiar
se registra como warning y el correctivo se muestra como «Execution», en vez de reportar una
asignación fallida.

`Assigned` **no se puede usar como filtro** contra openMAINT (no existe allí), por eso
`CORRECTIVE_FILTERABLE_STATUSES` lo excluye.

La derivación vive en `resolveCorrectiveStatus` (`constants/corrective-maint.constants.ts`) y la
usan **los dos roles**: `toCorrective` en supervisión y los dos mapeos de `incidents.service.ts`. Es
deliberado que sea una sola función: cuando cada servicio derivaba lo suyo, el supervisor veía
«Asignado» y el técnico «Ejecución» sobre el mismo trabajo.

El ciclo se cierra con `POST /incidents/:id/start`, que sella la hora real cuando el técnico
arranca — ver `docs/incidents module/incident-execution.endpoints.md`.

---

## 5. La revisión de cierre, y por qué el preventivo no la tiene

**Un proceso completado no se puede reabrir.** Queda `_FlowStatus_code: closed.completed`, con su
`_tasklist` en `DUMMY_TASK_FOR_CLOSED_PROCESS`, `writable: false` y `performer: "nobody"`.

Por eso la revisión **ocurre antes del cierre**, aprovechando un paso que ya existía en el
correctivo: `CM05-Accounting` está `open.running` y ofrece «Approve» y «Back to assignment». El
técnico concluye con `CM03-Advance` y el trabajo cae ahí; el supervisor aprueba o lo devuelve a
asignación conservando cesionario y equipo.

**`PreventiveMaint` no tiene equivalente**: `PM03-Advance` cierra el proceso directamente. Darle
revisión exigiría añadir un paso en el diseñador de CMDBuild, lo que afectaría a las instancias en
vuelo. Queda fuera de alcance, y por eso `meta.pendingReview` viene `null` en el listado
preventivo — la UI oculta el contador en vez de mostrar un cero engañoso.

**No confundir los dos rechazos:**

| Acción | Desde | Efecto |
|---|---|---|
| Rechazar y cerrar | `CM-Assignment` | El correctivo queda **Cancelado** |
| Rechazar el cierre | `CM-Accounting` | Vuelve a **Asignación** para repetirse |

---

## 6. Endpoints

Base `/maintenance-supervision`. Cabeceras: `authorization` (sesión openMAINT) y `x-role`.

| Verbo | Ruta | Notas |
|---|---|---|
| GET | `/corrective` · `/preventive` | `?status=&assigned=&limit=10&offset=0`. `meta.unassigned` en ambos; `meta.pendingReview` solo en correctivo |
| GET | `/:kind/:id` | Detalle en solo lectura |
| GET | `/:kind/:id/attachments` | Evidencia fotográfica, ya en base64 |
| GET | `/assignees?teamId=` | `isSupplier` sale de la subclase de la ficha |
| POST | `/corrective/:id/assign` | `CM02-Advance` con Assignee + Team + ExpExecStartDate |
| POST | `/corrective/:id/reject` | `CM02-Reject`; motivo obligatorio |
| POST | `/preventive/:id/assign` | `PM01-Advance`; **solo Assignee** |
| PUT | `/:kind/:id/assignee` | `saveFields`, sin mover el flujo |
| POST | `/corrective/:id/review` | `CM05-Advance` / `CM05-Back` |
| PUT | `/:kind/:id/planned-start` | `ExpExecStartDate`; solo en CM02 / PM02 |

### Los contadores de la cabecera

`meta.total` responde al filtro activo, así que no sirve para saber cuánto trabajo queda por
despachar. Por eso hay dos contadores independientes que se calculan aparte, cada uno con un
`count` que pide `limit=1` y se queda con `meta.total`:

| Contador | Criterio | Disponible en |
|---|---|---|
| `unassigned` | `Assignee isnull` | correctivo y preventivo |
| `pendingReview` | `ProcessStatus = CM-Accounting` | solo correctivo |

Ambos son **informativos**: si el conteo falla se devuelve `null` y el listado sigue sirviendo. La
UI oculta la tarjeta cuando llega `null`, en vez de pintar un cero engañoso — el mismo criterio que
ya se usaba con `pendingReview` en preventivos.

### La evidencia fotográfica

`GET /:kind/:id/attachments` devuelve las imágenes **ya resueltas a base64**, aprovechando el
endpoint `preview` que OpenMAINT ofrece por adjunto. Así el navegador las pinta directamente: no
hace falta un endpoint de descarga que reenvíe el binario ni que la sesión de OpenMAINT salga del
backend.

Se filtran por extensión (`png`, `jpg`, `jpeg`, `webp`, `heic`, `heif`) y se descartan los adjuntos
sin vista previa —un PDF, por ejemplo, no la ofrece—. Si listar los adjuntos falla se devuelve
vacío en vez de propagar el error: la evidencia es complementaria y no debe tumbar la pantalla de
detalle. En el frontend se pide en paralelo al detalle, por lo mismo.

Cada proceso tiene su propio gateway de adjuntos y se reutilizan tal cual: `getIncidentAttachments`
/ `getAttachmentPreview` en correctivos y `findAttachments` / `findAttachmentPreview` en
preventivos.

### Por qué hay un detalle propio

`GET /preventive-maintenance/:id` serviría, pero la pantalla del técnico llama a
`POST /:id/start` **al montar**, y eso avanza el flujo de Asignación a Ejecución. El supervisor no
puede provocar esa transición solo por abrir un detalle. El mismo cuidado ya lo tenía
`PastPreventiveMaintenancePage`.

### Sobre el gating por `x-role`

`x-role` sale de `localStorage` en el navegador y **es manipulable**. Solo evita llamadas
accidentales desde un rol equivocado: la barrera real son los permisos de grupo de la sesión en
openMAINT. Mismo criterio que el módulo de limpieza.

---

## 7. Identificar a un proveedor

No hay ningún flag en `Team`. La clase `Employee` tiene subclases y el campo `_type` de la ficha
dice cuál: `InternalEmployee`, `ExternalEmployee`, **`SupplierEmployee`**, `CustomerEmployee`.

Un proveedor pertenece a un solo equipo, así que sus mantenimientos **no son reasignables**: el
servicio responde 409 y la UI muestra el formulario bloqueado con el motivo.

---

## 7 bis. Quién aparece en la lista de cesionarios

Dos reglas, y ninguna de las dos es «el que ya lo tiene»:

- **Nadie se asigna trabajo a sí mismo.** El empleado de la sesión se descarta de la lista: quien
  supervisa reparte, no ejecuta. Sale de `getEmployeeId()` en el navegador; si la sesión no tiene
  ficha de empleado no se filtra a nadie.
- **El cesionario actual sí aparece.** Excluirlo dejaba sin salida el caso más frecuente: un
  correctivo devuelto desde la revisión, que vuelve con cesionario puesto y que casi siempre debe
  repetir la misma persona.

Los proveedores solo se descartan al **reasignar**, por lo de §7.

---

## 7 ter. Actividades caducadas (`task not found`)

Cada avance **consume** el `_tasklist[0]._id` y crea otro para el paso siguiente. Si llega una
petición con un id ya gastado, openMAINT responde **500** con un volcado de Java:

```
org.cmdbuild.workflow.model.WorkflowException: error building task for card = Flow{…},
user task id = …, caused by: java.lang.NullPointerException: task not found for instanceId = …
```

Los servicios releen la tarjeta justo antes de actuar, así que la ventana es corta — pero existe si
dos acciones se solapan: doble clic, dos pestañas, o la interfaz de openMAINT abierta al lado.

Dos medidas: los botones que avanzan el flujo se bloquean mientras hay una petición en vuelo, y
`call()` traduce ese error a un **409** con instrucción de recargar (`isStaleActivity`), en vez de
enseñar la traza.

---

## 8. Estado de la implementación

**Hecho**: listados con filtros y paginación de 10, detalle, asignación, rechazo, reasignación,
revisión de cierre y fecha prevista.

**Probado contra el clon (2026-08-21)**, con la sesión de `usuario.proveedor`:

1. ✅ **Prueba de humo del rol.** `wf_plus` basta: `CM02-Advance`, `CM03-Advance` y `CM05-Back` se
   aplicaron de verdad. Ver §2.
2. ✅ **`ExecStartDate` acepta `null`.** El estado «Asignado» se sostiene por ausencia de fecha; no
   hace falta la marca `[Asignado: <iso>]` en `Register`. Ver §4.

**Probado contra el clon (2026-08-24)**, con la sesión de `wilmer.palma` (`MaintOffice`), sobre
`CM.2026.0152`: el ciclo iniciar → finalizar del técnico, restaurando el registro al terminar. Ver
`docs/incidents module/incident-execution.endpoints.md`.

**Ciclo completo (2026-08-24)** sobre `CM.2026.0140`, por los endpoints del backend y devolviendo el
registro a su estado inicial: asignar → iniciar → finalizar → rechazar → **asignar de nuevo al mismo
cesionario**. Confirma las tres cosas de §2: la duración se registra, devolver la borra, y volver a
asignar a la misma persona funciona.

**Pendiente**:

1. **Correctivos anteriores a este arreglo** siguen con el `ExecStartDate` autorrellenado, así que
   se muestran como «En ejecución» aunque nadie los haya empezado. Eran 5 en el clon. O se dejan
   así, o se limpian una vez.
2. **`assignCorrective` no valida que el cesionario pertenezca al equipo** que fija, a diferencia
   de `updateAssignee`. La API REST no aplica las reglas de validación del formulario de openMAINT,
   así que la comprobación tendría que hacerla el servicio.
3. **Sin cobertura**: `CM04` (proveedor) y los pasos `Estimate` / `Control`; y en preventivos, un
   suspendido no se puede reanudar desde la app pese a que `PM_ACTIONS.RESUME` existe.
