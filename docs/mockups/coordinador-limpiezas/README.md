# Prototipo: Coordinador de limpiezas

Prototipo navegable del rol **Coordinador de limpiezas** (Code openMAINT `Coordinator`). Sirve para validar el diseño con el equipo antes de implementarlo en `modulo-incidentes`.

**No es la app.** No se conecta a openMAINT, a Hostaway ni al backend: todo corre en el navegador con datos de ejemplo. Los campos, estados y respuestas imitan los reales. Cada pantalla marca qué existe hoy en el backend y qué habría que construir.

> Verificado contra el código el 30/09/2026 (rama `develop`, `18181ab`). Si el backend o el parser de checklists cambian, este prototipo queda desactualizado.

## Cómo abrirlo

- **Local:** doble clic en `index.html`. Necesita internet para cargar Tailwind, Preact y los íconos desde CDN.
- **Enlaces directos:** el hash lleva a cada pantalla, por ejemplo `index.html#pendientes`, `#agenda`, `#sincronizacion`, `#checklists`, `#nueva`, `#limpieza-2310013` (una ficha) o `#checklist-9002`.
- Las fechas se arman relativas al día en que lo abras (internamente la hora está fija en 10:30, Guayaquil), así los números siempre calzan. La interfaz no muestra la hora.

## Panel del prototipo

Botón oscuro **Prototipo**, abajo a la izquierda:

| Control | Qué hace |
|---|---|
| Escenario | Día normal · Sincronización con errores · Sin pendientes · Sin checklists · Hostaway caído |
| Anotaciones (tecla A) | Marca cada elemento con una etiqueta y muestra qué endpoints usa la pantalla o el panel abierto |
| Simular error en la próxima acción | La próxima vez que guardes algo, el "servidor" responde con error |
| Reiniciar datos | Vuelve a los datos de ejemplo del escenario actual |

Etiquetas de las anotaciones (pasa el mouse sobre la etiqueta para leer el detalle):

| Etiqueta | Significado |
|---|---|
| **Existe** | Hay backend hoy |
| **Ajuste** | Existe, pero hace falta rol, guard, filtro o un campo más |
| **Propuesta** | Requiere desarrollo de backend |
| **Solo UI** | Se resuelve en la pantalla |
| **Supuesto** | Decisión a validar con el equipo |

## Qué hace el coordinador

| Hace | No hace (queda con SupervisorLimpieza, AsistenteSL o SuperUser) |
|---|---|
| Sincronizar con Hostaway (un día o un rango) y revisar los checkouts antes de sincronizar | Ejecutar limpiezas |
| Completar las pendientes: unidad, horario, empleado, checklist y observaciones, una por una | Revisar, aprobar o rechazar |
| Crear limpiezas manuales (`Source: Manual`) | Reabrir |
| Editar limpiezas que no empezaron, corregir un checkout cambiado y cancelar (huérfanas incluidas) | Editar o reasignar una limpieza en pausa |
| Ver la agenda del día por empleado, con superposiciones y atrasos | |
| Crear y editar checklists, como en openMAINT | |

## Pantallas

| Pantalla | Para qué |
|---|---|
| **Panel** | Indicadores del día y checkouts de hoy con su limpieza |
| **Pendientes** | Limpiezas sin empleado o sin horario, recién creadas arriba. Se completan una por una |
| **Limpiezas** | Tabla de todas las limpiezas y agenda del día en línea de tiempo por empleado |
| **Sincronización** | Reemplaza la página ExtJS de openMAINT: sincronizar un día elegido, revisar un rango con el estado de cada reserva, crear una limpieza suelta desde la vista previa o sincronizar el rango completo |
| **Checklists** | Lista de `CleaningActivity` y ficha para crear o editar, con vista previa igual a la del empleado |
| **Ficha de limpieza** | La tarjeta completa. Se edita si no empezó; si no, es de solo lectura con el motivo |
| **Nueva limpieza** | Limpieza manual. Sin empleado, queda en Pendientes |

## Decisiones tomadas (30/09/2026)

- **Versión:** solo escritorio por ahora. En pantallas angostas no se rompe, pero no hay diseño móvil.
- **Sincronización:** la dispara el coordinador. El temporizador diario del backend (`HOSTAWAY_SCHEDULER_ENABLED`) existe, viene apagado y no se usa.
- **Tarjeta sincronizada:** debe traer `HostawayListingID` = `listingMapId` de la reserva, para que openMAINT vincule la unidad. De la reserva se guarda solo la **fecha** de checkout, no la hora.
- **Unidad:** no es obligatoria. La limpieza se crea aunque el listing no tenga unidad en openMAINT.
- **Pausa:** una limpieza en pausa se ve como "En pausa" (aunque su fase sea `Assigned`) y no se puede reasignar.
- **Superposiciones:** solo avisan. No hay máximo de limpiezas por empleado.
- **Limpieza manual:** el empleado es opcional.
- **Checklists:** se crean y editan como en openMAINT: el archivo **Plantilla** es un campo más de la ficha. En la limpieza, el checklist es un campo más, sin checklist por defecto.
- **Minutos:** si un checklist no tiene minutos, no hay recordatorio y no se sugiere duración.
- **Empleados:** los proveedores no usan la app y no aparecen en el selector.
- **Datos ocultos:** no se muestra el nombre del huésped ni la hora de checkout.
- **Sincronización:** se elige el día (no solo hoy) y desde la vista previa se puede crear una limpieza suelta (`POST /cleaning-tasks`, que ya existe).
- **Horarios:** el inicio y el fin los escribe el coordinador; el checklist no sugiere duración.
- **Asignación:** una limpieza a la vez; no hay asignación en lote.
- **Orden:** las listas muestran primero lo recién creado.
- **Colores:** los de `statusPalette.ts`. En pausa violeta, atrasada roja, "Por asignar" gris. El rol va en índigo, provisional.

## Campos de la tarjeta

| En pantalla | API (camelCase) | Atributo openMAINT | El coordinador | Estado hoy |
|---|---|---|---|---|
| Número | `taskNumber` | `TaskNumber` | lee | Existe (puede repetirse; ver cambio 10) |
| Estado | `phase`, `isPaused` | `phase` | lee | Existe. "En pausa" y "Por asignar" se calculan en la pantalla |
| Origen | `source` | `Source` (Hostaway / Manual) | lee | Existe; `Manual` nunca se escribe |
| Descripción | `description` | `Description` | edita | Se lee; el PUT no la escribe |
| Reserva de Hostaway | `hostawayReservation` | `HostawayReservation` | lee | Existe (evita duplicados) |
| Listing de Hostaway | `hostawayListingId` | `HostawayListingID` | lee | **Nuevo** (cambio 1) |
| Fecha de checkout | `checkoutDate` | `CheckoutDate` | edita | Se lee; el PUT no la escribe |
| Sincronizada el | `generatedDate` | `GeneratedDate` | lee | Existe |
| Unidad | `unit` | `Unit` | edita (opcional) | Se lee; nunca se escribe |
| Inicio / Fin planificado | `plannedStartTime`, `plannedEndTime` | `PlannedStartTime`, `PlannedEndTime` | edita | Existe (PUT) |
| Empleado | `employee` | `Employee` | edita | Existe (PUT, con aviso al empleado) |
| Checklist | `checklistDetail` | `CleaningChecklist` → `CleaningActivity` | edita | Se lee; el PUT no lo escribe |
| Observaciones | `taskObservations` | `Observations` | edita | Existe (PUT) |
| Ejecución | `actualStartTime`, `actualEndTime`, `executionTime`, `delayTime` | `ActualStartTime`, `ActualEndTime`, `ExecutionTime`, `DelayTime` | lee | Existe |
| Bitácora / Supervisión | `teamObservations`, `supervisionObserv` | `TeamObservations`, `SupervisionObserv` | lee | Existe |
| Motivo de cancelación | — | `Notes` | escribe al cancelar | Cancelar es solo de supervisión; `Notes` nunca se devuelve |

Checklist (`CleaningActivity`): `NombrePlantilla` (en pantalla, "Nombre de checklist"), `Code`, `Description`, `Detalle` (texto) y `Plantilla` (archivo CSV). Si el archivo se puede leer, el equipo ve el archivo; si no, el `Detalle`. El CSV tiene las columnas `Titulo, Actividad, Minutos`, con separador coma o punto y coma.

## Cambios de backend para la implementación real

Ninguno está hecho en esta rama.

1. **Sincronización:** enviar `HostawayListingID: dto.listingId` (el `listingMapId` de la reserva) al crear la tarjeta, en el cuerpo de `createCleaningTask` de `cleaning-tasks.service.ts`. Hoy se descarta. Antes de desplegar, el atributo tiene que existir en `CleaningTask` en todas las instancias de openMAINT.
2. **`PUT /cleaning-tasks/:id`:** hoy escribe solo empleado, horario y observaciones. Tiene que escribir también unidad, checklist, descripción y fecha de checkout. Además, `employeeId` debe ser número (hoy es texto) y hay que exigir sesión y rol.
3. **Crear limpieza manual:** endpoint nuevo con `Source: Manual`. El DTO sin trackear `create-manual-cleaning-task.dto.ts` sirve de base, con empleado y unidad opcionales.
4. **Checklists:** endpoints para listar, crear y editar `CleaningActivity`, incluida la subida del archivo `Plantilla`. Hoy el backend solo lee un checklist por id.
5. **Empleados de limpieza:** listado sin proveedores. El mapeo ya existe en `maintenance-supervision` (`getEmployees`).
6. **Rol `Coordinator`:** necesita su propio conjunto de roles, con permiso para cancelar. Sumarlo a `SUPERVISOR_ROLES` le daría revisar, reabrir y los avisos de supervisión. Además hay que crear el grupo en openMAINT, con permisos sobre `CleaningTask` y `CleaningActivity`.
7. **Endpoints sin sesión:** `checkouts`, `sync*`, `GET/POST /`, `generate` y `PUT :id` hoy no piden sesión. Si se les exige, la página ExtJS de openMAINT deja de funcionar.
8. **Listado:** `/all?date` filtra por `GeneratedDate` (en UTC), devuelve 50 por página y no incluye el checklist. La tabla y la agenda necesitan filtrar por fecha planificada y por fecha de checkout.
9. **Errores de sincronización:** hoy la respuesta trae solo contadores, sin decir qué reservas fallaron.
10. **`TaskNumber` repetido:** usa los últimos 4 dígitos del reloj y las tarjetas se crean en paralelo, así que dos pueden quedar con el mismo número.
11. **Bug del parser de checklists:** una fila con la celda de minutos vacía (`Baño;Lavar cortina;`, lo que Excel escribe siempre) se muestra como "Lavar cortina;". Se arregla con una línea en `toRow` (`cleaningChecklistUtils.ts`). El prototipo lo reproduce y lo avisa.
12. **Colores de la tarjeta del empleado:** usa verde para "en pausa" y naranja para "atrasada", distinto de `statusPalette.ts`. Se decidió `statusPalette`.
13. **Layout de escritorio en la app:** hoy todo vive en `max-w-md` (`AppLayout.tsx`). Hay que sumar el rol a `rolePalette`, `BottomNav` e `isBottomNavRoute`.

## Supuestos a validar

- Pendiente = fase Asignada, sin empezar, sin pausa, y sin empleado o sin horario. La unidad no cuenta.
- En una limpieza manual son obligatorios la descripción, la fecha y el horario.
- Una limpieza reabierta queda en manos de supervisión: el coordinador no la edita.
- El coordinador cancela solo limpiezas que no empezaron.
- Asignar avisa al empleado (eso ya existe). Reprogramar no avisa, como hoy.

## Recorrido de prueba

Con el escenario "Día normal" recién cargado:

1. **Panel:** Por asignar 11, Programadas hoy 7, En ejecución 1 (+1 en pausa), Atrasadas 1, 9 checkouts hoy.
2. **Sincronización → Sincronizar un día (hoy):** 9 procesados, 1 creada, 8 duplicadas, 0 errores. La segunda vez: "Sin tareas nuevas: todas ya existían." Con mañana: 4 / 0 / 4 / 0. En la vista previa, "Crear limpieza" en la reserva 58201777 crea solo esa.
3. **Rango de hoy a +7 días:** 21 checkouts. Si sincronizas el rango con los datos recién cargados: 21 / 4 / 17 / 0.
4. **Pendientes → Completar CT.xxxx.1180:** inicio y fin se escriben a mano. Con el checklist "Repaso rápido" avisa que el empleado no tendrá recordatorios.
5. **Completar 6047** con Luis a las 12:00: avisa que se superpone con 11:30–13:00 y 12:30–14:00, pero deja guardar.
6. **Fichas:** 7736 dice "En pausa" y es de solo lectura; 4821 se puede editar y cancelar.
7. **Huérfana 1203:** se cancela con motivo. En **1214** se corrige la fecha de checkout y deja de figurar como cambiada.
8. **Agenda:** superposición de Luis en rojo, 2590 atrasada, línea "ahora" y franja "Sin horario".
9. **Nueva limpieza** sin empleado: aparece primera en Pendientes.
10. **Checklists → Limpieza profunda:** "Baño" aparece dos veces. Al subir un CSV se valida igual que en el backend: un .xlsx se rechaza y un archivo "Texto Unicode" avisa que está separado por tabulaciones.
11. Cada escenario del panel del prototipo, y "Reiniciar datos" desde cualquier pantalla.

## Notas técnicas

| Archivo | Contenido |
|---|---|
| `index.html` | Shell y CDNs fijadas: Tailwind Play 3.4.17, `htm@3.1.1/preact` standalone y `lucide@0.577.0` |
| `js/domain.js` | Funciones puras. **Copias fieles** de `parseCleaningChecklist` (frontend) y `readCsvTemplate` (backend), más las reglas de estado, pendiente, atraso, superposición y bitácora |
| `js/mock-data.js` | Datos de ejemplo, escenarios y `Coord.api.*`: una función por endpoint real o propuesto, con su forma de respuesta y 400 ms de latencia. `API_CATALOG` dice a qué endpoint corresponde cada una |
| `js/ui.js` | Estado global, router por hash y componentes compartidos |
| `js/screens/*.js` | Una pantalla por archivo |
| `js/app.js` | Menú, barra superior, panel del prototipo y arranque |

- **Sin build:** Preact + htm con scripts clásicos, para que abra con doble clic. Los componentes usan solo hooks y `className`, así pasarlos a TSX es mecánico. Al portar, los campos de texto usan `onInput`; en React es `onChange`.
- **Copias del código real:** las de `domain.js` se verificaron corriendo los tests originales (`cleaningChecklistUtils.test.ts` y `csv-template.util.spec.ts`) contra la copia.
- **Descargas:** una página publicada no puede descargar archivos. "Ver ejemplo de CSV" y "Ver contenido" muestran el texto para copiarlo; en la app serían descargas.
- **Fechas y horas:** los selectores son los nativos del navegador y siguen su idioma (en un navegador en español, formato 24 h).
