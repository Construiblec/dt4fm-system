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

> **Pendiente**: falta cerrar el ciclo con un `POST /incidents/:id/start` que selle la hora real
> cuando el técnico arranca, y permitir abrir el detalle de un correctivo «Asignado» desde la
> tarjeta del equipo (hoy solo deja abrir los que están en «Ejecución»). La tarjeta ya no es
> `TaskCard.tsx`: la comparten los dos roles en `shared/components/MaintenanceCard.tsx`.

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
| GET | `/corrective` · `/preventive` | `?status=&assigned=&limit=10&offset=0`. `meta.pendingReview` solo en correctivo |
| GET | `/:kind/:id` | Detalle en solo lectura |
| GET | `/assignees?teamId=` | `isSupplier` sale de la subclase de la ficha |
| POST | `/corrective/:id/assign` | `CM02-Advance` con Assignee + Team + ExpExecStartDate |
| POST | `/corrective/:id/reject` | `CM02-Reject`; motivo obligatorio |
| POST | `/preventive/:id/assign` | `PM01-Advance`; **solo Assignee** |
| PUT | `/:kind/:id/assignee` | `saveFields`, sin mover el flujo |
| POST | `/corrective/:id/review` | `CM05-Advance` / `CM05-Back` |
| PUT | `/:kind/:id/planned-start` | `ExpExecStartDate`; solo en CM02 / PM02 |

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

## 8. Estado de la implementación

**Hecho**: listados con filtros y paginación de 10, detalle, asignación, rechazo, reasignación,
revisión de cierre y fecha prevista.

**Probado contra el clon (2026-08-21)**, con la sesión de `usuario.proveedor`:

1. ✅ **Prueba de humo del rol.** `wf_plus` basta: `CM02-Advance`, `CM03-Advance` y `CM05-Back` se
   aplicaron de verdad. Ver §2.
2. ✅ **`ExecStartDate` acepta `null`.** El estado «Asignado» se sostiene por ausencia de fecha; no
   hace falta la marca `[Asignado: <iso>]` en `Register`. Ver §4.

**Pendiente**:

1. **`POST /incidents/:id/start`** y los ajustes en la vista del técnico (§4).
2. **Correctivos anteriores a este arreglo** siguen con el `ExecStartDate` autorrellenado, así que
   se muestran como «En ejecución» aunque nadie los haya empezado. Eran 5 en el clon. O se dejan
   así, o se limpian una vez.
3. **`assignCorrective` no valida que el cesionario pertenezca al equipo** que fija, a diferencia
   de `updateAssignee`. La API REST no aplica las reglas de validación del formulario de openMAINT,
   así que la comprobación tendría que hacerla el servicio.
4. **Sin cobertura**: `CM04` (proveedor) y los pasos `Estimate` / `Control`; y en preventivos, un
   suspendido no se puede reanudar desde la app pese a que `PM_ACTIONS.RESUME` existe.
