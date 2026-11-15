# Supervisión posterior de limpieza – Backend

**DT4FM – Digital Twin for Facility Management**

## 1. Qué resuelve

Antes, «corregir» una limpieza era devolver la misma `CleaningTask` a `Assigned`, con la nota en `SupervisionObserv`. Ahora la supervisión es una tarjeta aparte, con sus novedades. Así queda separada de la ejecución de la limpieza:

- **`CleaningSupervision`**: una tarjeta por cada revisión.
- **`CleaningFinding`**: una tarjeta por cada novedad (algo que está mal).

**Solo se guarda lo que está mal.** Un punto correcto no deja rastro. Por eso, que un punto no tenga novedad no prueba que se haya revisado.

La limpieza se queda en `Completed` mientras se corrige y pasa a `Reviewed` cuando se aprueba la unidad. Sus tiempos no cambian.

## 2. Modelo en openMAINT

Verificado el 14/11/2026 contra `construiblec.cloud`.

**`CleaningSupervision`** (ningún atributo es obligatorio):

| Atributo | Tipo | Uso |
|---|---|---|
| `CleaningTask` | Ref → CleaningTask (dominio `CleaningSupervision`) | Limpieza supervisada |
| `Unit` | Ref → Unit (dominio `UnitSupervision`, inversa) | Unidad |
| `Checklist` | Ref → CleaningActivity (dominio `ChecklistSupervision`, inversa) | Checklist de supervisión |
| `Employee` | Ref → Employee (dominio `SupervisionEmployee`) | **Corrector** |
| `Supervisor` | Ref → InternalEmployee (dominio `SupSupervisor`) | Quien supervisa |
| `Phase` | Lookup `CleaningSupervisionStatus` | Fase. **No** usar `Status`, que es una columna de sistema |

**`CleaningFinding`**:

| Atributo | Tipo | Uso |
|---|---|---|
| `Supervision` | Ref → CleaningSupervision (dominio `CleanSupFinding`, maestro-detalle) | Supervisión a la que pertenece |
| `Index` | Integer | Número de punto del CSV (1 = primera fila) |
| `Subcategory` | Ref → MaintSubcategory (dominio `CleanFindingSubcat`) | Novedad de la categoría Limpieza (LIM) |
| `Observation` | Texto | Obligatoria si la novedad es «Otro». Máximo 500 caracteres |
| `Description` | Texto (base) | Marca **provisional** de «Resuelto por supervisor» (ver §2.1) |

**Fotos.** Son adjuntos de la tarjeta `CleaningFinding`, sin categoría DMS, con un máximo de 2 por novedad. El backend les pone nombre con el prefijo `nov_`.

### 2.1 «Resuelto por supervisor»

El supervisor puede marcar una novedad como resuelta al momento. Una novedad resuelta **no va a corrección**:
- el operario no la ve;
- «Asignar» y el aviso cuentan solo las no resueltas;
- si todas están resueltas, se aprueba directo desde `Draft`.

Todavía no existe un atributo booleano en openMAINT para esto. Mientras tanto, la marca se guarda en `Description` con el texto `Resuelto por supervisor`. Todo pasa por `utils/finding-resolution.util.ts`. Cuando se cree el atributo:
1. Se pone su nombre en `OPENMAINT_FINDING_RESOLVED_ATTRIBUTE`.
2. El backend escribe el booleano y limpia `Description`.
3. Al leer acepta las dos formas, así que lo marcado antes sigue contando.

Ni la API (`resolvedBySupervisor: boolean`) ni el frontend cambian.

**Checklist.** Es la tarjeta de `CleaningActivity` con `Code = SUPERVISION`. Su CSV va en `Plantilla` y tiene el encabezado `area;guia_area;nombre_item;descripcion_criterio`. Hoy tiene 19 puntos.

**Fases.** El lookup llega a la API como Id, no como código. El backend lee los Id de `/lookup_types/CleaningSupervisionStatus/values` y los guarda en caché 30 minutos.

**Escrituras.** Todas van por la API, nunca por SQL: cada referencia vive en la columna y también en `Map_<Dominio>`.

## 3. Fases

| Código | Entra por | Quién |
|---|---|---|
| `Draft` | Finalizar la limpieza, o recuperar el borrador al abrirla (ver §4) | Backend |
| `InCorrection` | Asignar con al menos una novedad, o reasignar desde InCorrection o Fixed | SupervisorLimpieza |
| `Fixed` | «Resuelto» | Corrector asignado |
| `Confirmed` | Confirmar arreglos desde InCorrection o Fixed | SupervisorLimpieza |
| `Approved` | Aprobar desde Confirmed, o desde Draft sin novedades | SupervisorLimpieza |
| `Cancelled` | Reabrir la limpieza, o crearse el Draft de una limpieza más reciente de la misma unidad | Backend |

## 4. Cuándo nace una supervisión

1. **Al finalizar la limpieza.** `completeTask` escribe primero la fase y después crea el `Draft`, con Supervisor y Corrector vacíos. Si la creación falla, la limpieza queda `Completed` igual y en el log queda un aviso.
2. **Al abrirla desde el panel** (`POST /cleaning-supervisions`). Si la limpieza no tiene supervisión abierta, el borrador se recupera solo si se cumplen tres condiciones:
   - está `Completed`;
   - `ActualEndTime ≥ SUPERVISION_START_DATE`;
   - ninguna otra limpieza `Completed` o `Reviewed` de la misma unidad terminó después.

   Si no se cumplen, responde **409** con `reason`:
   - `legacy`: la limpieza terminó antes del corte.
   - `superseded`: hay una limpieza posterior de la misma unidad.
   - `disabled`: falta la variable `SUPERVISION_START_DATE`.
   - `reviewed`: la limpieza está revisada y no tiene supervisión.
3. **Los borradores superados se anulan.** Al crear un `Draft`, se anulan los `Draft` de la misma unidad cuya limpieza terminó antes. Las supervisiones que ya avanzaron (InCorrection en adelante) no se tocan. Si la anulación falla, no deshace la creación.

**Limpiezas anteriores al corte.** Quedan en `Completed`, sin supervisión y sin forma de cerrarlas desde la PWA. Es una decisión del 14/11/2026: el 14/11 había 37 `Completed` frente a 2 `Reviewed`, y muchas tenían días de antigüedad o había varias de la misma unidad. Inspeccionarlas ya no reflejaría la limpieza que hizo cada operador.

**Reabrir.** Primero se anula la supervisión abierta (no se borra: conserva las novedades y las fotos) y después se reabre la limpieza. Si la anulación falla, la reapertura falla entera, para que la siguiente finalización no reutilice las novedades viejas.

## 5. Quién puede qué

- **Panel y acciones de supervisión:** solo `SupervisorLimpieza`. AsistenteSL y SuperUser no entran: no se usa `SUPERVISOR_ROLES`.
- **Coordinación** (`Coordinador`, `SuperUser`): lee el detalle y las fotos, sin acciones.
- **Operario:** se identifica por `Employee.PortalUsername` desde su sesión, nunca por `x-cleaning-employee-id`. Ve, descarga y marca «Resuelto» solo en sus supervisiones `InCorrection`.
- **Supervisor al iniciar:** su ficha se resuelve por `Employee.LoginUser` desde la sesión, y debe ser `InternalEmployee`.

Todo se escribe con la cuenta de servicio. Por eso el backend comprueba rol, fase y pertenencia antes de cada escritura:

- la novedad debe pertenecer a la supervisión;
- la foto debe estar en la lista de adjuntos de esa novedad;
- el Corrector debe pertenecer al equipo `OPENMAINT_CLEANING_TEAM_ID`;
- la subcategoría debe ser de LIM. La API de openMAINT no aplica el filtro CQL de la interfaz, así que esta validación la hace el backend.

## 6. Endpoints

Todos los endpoints llevan `x-session-token`. La descarga también acepta `?token=`.

| Método y ruta | Acción |
|---|---|
| `GET /cleaning-supervisions/template` | Áreas y puntos del checklist |
| `POST /cleaning-supervisions` `{ taskId }` | Devuelve la abierta o recupera el Draft (409 con `reason`) |
| `GET /cleaning-supervisions/mine` | Las del operario en InCorrection |
| `GET /cleaning-supervisions/:id` | Detalle: novedades, fotos, checklist y `can.*` |
| `POST /:id/start` | Asigna el Supervisor |
| `POST/PATCH/DELETE /:id/findings[/:findingId]` | Novedades (solo Draft). Aceptan `resolvedBySupervisor` |
| `POST /:id/findings/:findingId/photos` | Foto (máximo 2, solo Draft) |
| `DELETE /:id/findings/:findingId/photos/:attachmentId` | Borra una foto |
| `GET /:id/findings/:findingId/attachments/:attachmentId/download` | Proxy de la foto |
| `POST /:id/assign` `{ employeeId }` | Asigna o reasigna → InCorrection y push al Corrector |
| `POST /:id/fixed` | «Resuelto» → Fixed y push a SupervisorLimpieza |
| `POST /:id/confirm` | → Confirmed |
| `POST /:id/approve` | Limpieza → Reviewed y luego supervisión → Approved. Se puede reintentar |

**Cambios en `/cleaning-tasks`:**
- **Retirados:** se quitó `PATCH /:taskId/review` (el método `reviewTask` queda sin ruta) y `canReview` ahora siempre es `false`.
- **`GET /all`:** cada limpieza trae `supervision` (la última, o `null`) y `supervisionEligible`.
- **Detalle de supervisión y coordinación:** trae lo mismo.
- **`GET /employees`:** también lo puede usar SupervisorLimpieza.
- **Checklists:** traen `kind: 'supervision' | 'execution'`. Al guardar la plantilla `SUPERVISION`:
  - se valida el CSV de 4 columnas y que tenga 19 puntos;
  - no se puede cambiar su `Code` ni quitar su archivo.

## 7. Notificaciones

| Tipo | Destino | Enlace |
|---|---|---|
| `cleaning.completed` | SupervisorLimpieza | `/supervision/tarea/:taskId` |
| `cleaning.completed` | AsistenteSL, SuperUser | `/supervisor/tasks/:taskId` (corrige el enlace roto `/supervisor/task/`) |
| `cleaning.corrections-assigned` | Corrector | `/cleaning-corrections/:supervisionId` |
| `cleaning.corrections-fixed` | SupervisorLimpieza | `/supervision/:supervisionId` |

## 8. Configuración

`SUPERVISION_START_DATE` es una fecha ISO con zona horaria, por ejemplo `2026-12-01T00:00:00-05:00`. Se fija en cada ambiente con la fecha de su despliegue.

Orden de despliegue: openMAINT → backend → frontend. Mientras el frontend no se actualice, la PWA anterior no puede aprobar limpiezas, porque la revisión directa se retiró.

## 9. Límites

- Las fotos son solo de la novedad: el operario no sube fotos del arreglo ni resuelve punto por punto.
- Hay un solo Corrector por supervisión. Para cambiarlo se reasigna el conjunto.
- No hay control de ediciones simultáneas (decisión del usuario).
- El historial de openMAINT muestra la cuenta de servicio como autora de las escrituras.
- No se reordenan ni se borran filas del CSV de supervisión: `Index` apunta a la posición de la fila.
