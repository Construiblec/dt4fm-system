# Coordinador de Limpiezas – Backend y Frontend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

El coordinador (Code de openMAINT `Coordinador`; `SuperUser` también entra) prepara las limpiezas antes de que las ejecute el equipo:

- Sincroniza con Hostaway (un día o un rango) y revisa los checkouts antes de crear.
- Completa las limpiezas pendientes, una por una: unidad, horario, empleado, checklist y observaciones.
- Crea limpiezas manuales (`Source: Manual`).
- Edita y cancela las limpiezas que **no han empezado**.
- Ve la agenda del día por empleado, con superposiciones y atrasos.
- Crea y edita checklists (`CleaningActivity`), incluido el archivo `Plantilla`.

No ejecuta, no revisa, no aprueba y no reabre: eso sigue siendo de `SupervisorLimpieza` / `AsistenteSL`.

El diseño sale del prototipo `docs/mockups/coordinador-limpiezas/` (README del 30/09/2026), que lista las decisiones tomadas. Este documento describe lo implementado.

---

## 2. Roles

`constants/roles.constants.ts`:

| Constante | Roles | Uso |
|---|---|---|
| `SUPERVISOR_ROLES` | `SuperUser`, `SupervisorLimpieza`, `AsistenteSL` | Sin cambios: revisar, reabrir, evidencia de supervisión |
| `COORDINATOR_ROLES` | `SuperUser`, `Coordinador` | Sincronizar, completar, checklists, crear manual |
| `isSupervisorOrCoordinatorRole` | unión de ambos | Listado `/all`, detalle, `PUT :id`, `PATCH :id/cancel` |
| `isCoordinatorOnly` | coordinador que no es supervisor | A quien se aplican las **restricciones** |

Sumar `Coordinador` a `SUPERVISOR_ROLES` le habría dado revisar, reabrir y los avisos de supervisión; por eso tiene su propio conjunto.

Las restricciones solo se aplican a quien es coordinador **y no** supervisor. Un `SuperUser` conserva todo lo que ya podía.

---

## 3. Endpoints

Todos exigen `x-session-token`. Las rutas estáticas van antes de `:taskId`.

| Endpoint | Rol | Qué hace |
|---|---|---|
| `GET /cleaning-tasks/all?sort=newest` | supervisión o coordinación | Todas las limpiezas, las recién creadas primero; devuelve `hostawayListingId`, `checklist{id,description}` |
| `GET /cleaning-tasks/:taskId` | supervisión o coordinación | Ficha: añade `hostawayListingId`, `cancelReason`, `unit.buildingId` |
| `GET /cleaning-tasks/checkouts/preview?dateFrom&dateTo` | coordinación | Checkouts de Hostaway cruzados con las limpiezas existentes |
| `POST /cleaning-tasks/manual` | coordinación | Limpieza manual: obligatorios `description`, `plannedStartTime`, `plannedEndTime` |
| `PUT /cleaning-tasks/:id` | supervisión o coordinación | Edita descripción, fecha de checkout, unidad, horario, empleado, checklist y observaciones |
| `PATCH /cleaning-tasks/:taskId/cancel` | supervisión o coordinación | Cancela con motivo (se guarda en `Notes`) |
| `GET /cleaning-tasks/employees` | coordinación | Empleados internos (los proveedores no aparecen) |
| `GET/POST/PUT /cleaning-tasks/checklists`, `GET checklists/:id`, `GET checklists/:id/template` | coordinación | Checklists y descarga de su plantilla |
| `POST /cleaning-tasks/sync`, `/sync/today`, `POST /cleaning-tasks` | **sin guard** (ver §7) | Sincronización; devuelve `errors[{reservationId,listingName,message}]` |

### Restricciones del coordinador en `PUT :id` y `cancel`

- Solo limpiezas que no empezaron: fase `Assigned`, sin inicio real y sin pausa.
- No toca fase ni tiempos reales.
- El fin tiene que ser posterior al inicio.
- `null` borra unidad, checklist u observaciones.
- Solo notifica al empleado si **cambia** el empleado (reprogramar no avisa).
- Responde 400 si no hay nada que cambiar.

### Vista previa de checkouts

Cada fila trae un `status`:

| Estado | Significado |
|---|---|
| `por-crear` | La reserva no tiene limpieza |
| `creada` | Ya tiene limpieza |
| `cambio` | La limpieza dice otro checkout que Hostaway |
| `huerfana` | La limpieza existe pero la reserva ya no está en Hostaway (normalmente, cancelada). El backend la devuelve, pero la pantalla no la muestra: al coordinador solo le sirve saber si el checkout cambió |

y `unitMatch`: `ok`, `none` (el listing no tiene unidad) o `ambiguous` (dos unidades con el mismo `HostawayListingID`; la limpieza se crea sin unidad). Para las limpiezas sueltas (su reserva no vino en el rango) se consulta cada reserva por su id en Hostaway (`GET /v1/reservations/{id}`, de a 5): si sigue activa con otra fecha es `cambio`; si no existe o está cancelada, `huerfana`. Las limpiezas canceladas se excluyen.

**Rendimiento (14/10/2026).** Los checkouts se piden a Hostaway con `departureStartDate` / `departureEndDate`, que Hostaway sí aplica. Antes se mandaba `checkOutDateFrom/To`, que ignora: había que recorrer 2.500 reservas en 25 páginas (~25-40 s) y, con rangos de varios días, el tope de páginas dejaba checkouts fuera. Ahora un día tarda ~0,4 s en Hostaway y la vista previa completa ~2-3 s (antes ~25 s, o ~50 s con limpiezas sueltas).

---

## 4. Cambios en la sincronización

- `createCleaningTask` envía `HostawayListingID` (el `listingMapId` de la reserva) para que openMAINT vincule la unidad. **El atributo tiene que existir en `CleaningTask` en cada instancia de openMAINT.**
- El `TaskNumber` sale de un contador monótono (`nextTaskNumber`), no de los últimos dígitos del reloj: las tarjetas se crean en paralelo y antes podían repetirse.
- De la reserva se guarda solo la **fecha** de checkout, no la hora.
- La unidad no es obligatoria.

---

## 5. Checklists (`CleaningActivity`)

Campos: `NombrePlantilla`, `Code`, `Description`, `Detalle` (texto) y `Plantilla` (archivo CSV).

- El formulario del coordinador ya no pide el `Code`: no lo envía, y el backend no toca el `Code` que no llega. La `Description` es obligatoria en openMAINT; si queda vacía, el frontend manda el nombre.
- Si el archivo se puede leer, el equipo ve el archivo; si no, el `Detalle`.
- CSV con columnas `Titulo,Actividad` y, opcional, `Minutos`; separador coma o punto y coma; máximo 1 MB. Sin minutos no hay avisos: la revisión solo señala problemas de estructura (encabezado, tabulaciones, sección repetida, título sin actividad).
- El backend valida con `readCsvTemplate` antes de subir: vacío, más de 1 MB, Excel o PDF y sin filas se rechazan con 400.
- Al guardar se reemplaza o se quita el adjunto (`removeTemplate`).
- **Subida verificada contra openMAINT (2026-10-12):** subir el adjunto no enlaza `Plantilla`; después se guarda su id con `PUT { Plantilla: id }`. Para reemplazar o quitar el archivo se pone `Plantilla: null` (se lleva el adjunto); borrarlo directo o subir otro con el mismo nombre da 500 "file name conflict". Los adjuntos sueltos con el mismo nombre se limpian antes de subir.

---

## 6. Frontend

Módulo `frontend/modulo-incidentes/src/modules/coordinador/`, solo escritorio.

| Ruta | Pantalla |
|---|---|
| `/coordinador` | Redirige a Limpiezas, que es la pantalla principal (el panel del día se quitó) |
| `/coordinador/pendientes` | Limpiezas sin empleado o sin horario, 20 por página |
| `/coordinador/limpiezas` · `/agenda` | Tabla de un día (hoy al abrir, o todas las fechas) con menú de estados y 20 por página; agenda del día por empleado |
| `/coordinador/sincronizacion` | Creación automática: limpiezas de hoy o de mañana, y vista previa de un rango con estados y "Crear limpieza" por reserva |
| `/coordinador/checklists`, `/nuevo`, `/:id` | Lista y editor con subida de CSV y vista previa |
| `/coordinador/nueva` | Limpieza manual |

La ficha de una limpieza es un panel lateral controlado por la URL (`?limpieza=ID&modo=editar`): se puede enlazar y Atrás lo cierra.

- Entrada `Coordinador` en `shared/constants/rolePalette.ts` (índigo, `homeRoute: "/coordinador"`). El color es provisional.
- Colores de estado: los de `statusPalette.ts`.
- `domain/` reúne las reglas puras (pendiente, atraso, superposición, bitácora) con tests; `domain/csvTemplate.ts` es una copia del lector del backend, y debe mantenerse igual.
- Zona horaria: Guayaquil, UTC−5 fijo; las fechas viajan con offset `-05:00`.
- Fechas en dd/mm/aaaa (`DateField`) y horas en hh:mm de 24 h (`TimeField`). No se usan los `<input type="date|time">` nativos porque siguen el idioma del navegador: en español de Ecuador la hora sale en 12 h con a. m./p. m.
- Completar una pendiente se puede guardar a medias solo sin empleado: elegir empleado exige fecha y horario, porque el backend le avisa al asignarlo.

---

## 7. Pendientes y decisiones abiertas

1. ~~Subida de `Plantilla`~~: resuelta (ver §5).
2. **Endpoints sin sesión**: `GET /checkouts`, `POST /sync*`, `POST /` y `POST /generate` siguen públicos. Exigirles sesión rompería la página ExtJS de openMAINT que los usa.
3. **Grupo `Coordinador` en openMAINT**: crearlo con permisos sobre `CleaningTask` y `CleaningActivity`.
4. **Fuera de alcance acordado**: colores de la tarjeta del operario (pausa verde / atraso naranja), crear unidades, asignación en lote e historial de sincronizaciones.
