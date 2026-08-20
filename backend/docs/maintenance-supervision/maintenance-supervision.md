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

### ⚠️ El performer no es el supervisor

Los pasos del flujo tienen como *performer* a `MaintOffice` (PM01, CM02, CM05, CM07), `Team`
(CM03) y `Supplier` (CM04) — **nunca `SupervisorMantenimiento`**. El grupo tiene `wf_plus`, que
podría bastar para ejecutar actividades de otro performer, pero **no está verificado**.

Esto importa porque **openMAINT responde 200 a un `_advance` aunque no avance**: guarda los
atributos y deja el proceso donde estaba. Por eso toda escritura de este módulo **relee la tarjeta
y comprueba el estado** (`assertCorrectiveReached` / `assertPreventiveReached`); sin eso la UI le
diría al supervisor que asignó un trabajo que sigue sin asignar.

Si la prueba de humo falla, la salida es añadir el grupo como performer de `PM01-Opening`,
`CM02-Assignment` y `CM05-Accounting` en el diseñador de procesos.

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
instancia directamente a `CM-Execution`, y openMAINT rellena `ExecStartDate` con la fecha
*prevista*. El técnico vería una hora de inicio que no puso.

La app lo compensa en el mapeo (`toCorrective`): si el estado es `Execution` **y** no hay
`ExecStartDate`, expone `statusCode: "Assigned"` — un estado que no existe en openMAINT. Es el
mismo problema que el preventivo ya resolvía al revés en `registerExecutionStart`:

> `ExecStartDate` solo es escribible en PM03… OpenMAINT lo rellena al entrar con la fecha
> *prevista* y aquí se sobrescribe con la real.

`Assigned` **no se puede usar como filtro** contra openMAINT (no existe allí), por eso
`CORRECTIVE_FILTERABLE_STATUSES` lo excluye.

> **Pendiente**: falta cerrar el ciclo con un `POST /incidents/:id/start` que selle la hora real
> cuando el técnico arranca, y permitir abrir el detalle de un correctivo «Asignado» desde
> `TaskCard.tsx` (hoy solo deja abrir los que están en «Ejecución»).

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

**Pendiente**:

1. **Prueba de humo con un usuario real del rol** — hoy el único usuario del grupo es
   `usuario.proveedor` ("Proveedor Prueba"), que además no debería estar ahí. Sin ella no se sabe
   si `wf_plus` basta o hay que tocar los performers. **Ninguna escritura está probada contra
   openMAINT todavía.**
2. **¿`ExecStartDate` acepta `null` en CM03?** Decide si el estado «Asignado» se sostiene por
   ausencia de fecha o hace falta una marca `[Asignado: <iso>]` en `Register`.
3. **`POST /incidents/:id/start`** y los ajustes en la vista del técnico (§4).
