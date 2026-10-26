# SGCC ↔ OpenMaint: vínculo de clases

Mapeo de las clases de los diagramas SGCC (`SGCC_diagrama_clases.drawio`, `SGCC_modelo_dominio.drawio`) con lo que ya existe en OpenMaint. El catálogo se leyó del OpenMaint de staging: 125 clases, 5 procesos, 52 dominios y 121 tipos de lookup visibles para `svc-dt4fm`, más las clases estándar que existen pero esa cuenta no puede leer (Company, Team, Supplier, Contract, Floor, Room, Budget, PurchaseOrder, PrevMaintConfig, MaintenanceManual, MaintSLA, Parameter…).

## Tipos de vínculo

| Tipo | Significado |
|---|---|
| «reutiliza» | Es la misma entidad: se usa la clase existente (a lo sumo con atributos nuevos) |
| «especializa» | Clase nueva que hereda de la existente |
| «referencia» | Clase nueva con referencia o dominio hacia la existente |
| «nativo» | Lo resuelve CMDBuild/openMAINT sin crear clase |

## Núcleo transversal

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| ElementoGestion | Class → nueva superclase prototipo SgccElemento | especializa | Superclase abstracta como CI; las clases SGCC sin flujo heredan de ella. |
| Plan | Process → nuevo proceso SgccPlan | especializa | Planes con aprobación, versión y cambios como proceso, igual que MaintProcess. |
| VinculoTrazabilidad | Dominios (relaciones con atributos) | nativo | Cada TipoVinculo es un dominio; la relación inversa la da CMDBuild. |
| Decision | Reuniones | referencia | Nuevo dominio ReunionDecision: la decisión se toma en una reunión registrada. |
| RegistroCambio | Historial de tarjetas | nativo | CMDBuild guarda cada versión con usuario y fecha. |
| RegistroAuditoria | Historial + registro de sesiones | nativo | No hace falta clase propia. |

## ADM

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| Organizacion | Company | reutiliza | Ya enlazada con Employee (CompanyEmployee). Multiempresa: IdTenant. |
| UnidadOrganizativa | Team | referencia | Clase nueva jerárquica; Team pasa a ser una unidad de tipo «equipo». |
| Persona | Employee (InternalEmployee / ExternalEmployee) | reutiliza | Ya tiene Company, Team, LoginUser y calendario. |
| Usuario | User | reutiliza | El dominio UserEmployee ya implementa «identifica a» Persona. |
| Rol | Grupos de CMDBuild (Role) | nativo | Los grupos no se pueden referenciar desde tarjetas: clase espejo RolFuncional para COMP-01. |
| Perfil | Grupos de CMDBuild (menú y UI por grupo) | nativo |  |
| Permiso | Privilegios por clase con filtro de filas y atributos | nativo | Cubre recurso + operación + filtro. |
| Catalogo | Lookup types | nativo | 121 tipos de lookup ya cargados. |
| ValorCatalogo | Lookup values (admiten padre) | nativo |  |
| ParametroSistema | Parameter | reutiliza | Clase estándar de openMAINT. |
| ReglaNegocio | Funciones SQL, form triggers, filtros de dominio | nativo | Parcial: si el cliente debe configurarla, clase nueva. |
| FlujoTrabajo | Motor de workflow (Process / Activity) | nativo | Cada flujo SGCC es una subclase de Process. |
| EtapaFlujo | Actividades del XPDL | nativo |  |
| TransicionFlujo | Transiciones del XPDL | nativo |  |
| InstanciaFlujo | Instancia de proceso (FlowStatus) | nativo |  |
| Documento | DMS Alfresco (DmsModel / BaseDocument) | nativo | Adjuntos con categoría; uriAlfresco lo resuelve el DMS. |
| VersionDocumento | Versionado del DMS | nativo |  |
| Evidencia | DmsModel → nuevo modelo DmsEvidencia | especializa | Las fotos de limpieza y correctivo ya se guardan como adjuntos. |
| InterfazIntegracion | Import/export, gates ETL y API REST | nativo |  |
| OperacionIntercambio | Jobs del Task manager | nativo |  |

## Estrategia PGE · RUG · EIE

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| Recurso | CI / Asset, Employee, Consumable | referencia | Recurso genérico que apunta al activo, persona o consumible real. |
| InversionEstrategica | Budget / BudgetItem | referencia | Planificado = partida; ejecutado = AccountingMov. |
| CapacidadPersona | Employee (CalendarEntity, ServiceStatus) | referencia | La disponibilidad sale del calendario del empleado. |

## Ejecución GDD · GOCP

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| Actividad | MaintProcess (CorrectiveMaint, PreventiveMaint), CleaningTask | referencia | Enlaza con la orden real. No llamarla Activity (nombre reservado). |
| RegistroEjecucion | PreventiveMaint / CleaningTask | referencia | Plan vs real: PlannedStartTime/ActualStartTime, ExpExecStartDate/ExecStartDate. |
| MedicionEstabilidad | PreventiveMaint / CleaningTask (DelayTime, TTWork*) | referencia | Se calcula sobre datos existentes. |
| CausaNoEjecucion | Lookups MaintProcess - SuspensionReason / Outcome | reutiliza | Catálogo inicial. |
| Desviacion | MaintSLA | referencia | Desvío respecto al SLA. |
| Recordatorio | EmailTemplate + HistorialEmail | reutiliza | Envío por las notificaciones existentes; HistorialEmail registra el envío. |
| CicloRevision | Reuniones | referencia | La revisión del desempeño ocurre en una reunión. |

## Proyectos PRO

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| Proveedor | Supplier | reutiliza | Ya enlazado con CI (SupplierCI). |
| Adquisicion | PurchaseOrder | reutiliza |  |
| PresupuestoProyecto | Budget | reutiliza |  |
| PartidaCosto | BudgetItem / AccountingMov | reutiliza | montoPlan = BudgetItem; montoReal = AccountingMov. |
| Proyecto | Site / Building | referencia | Ubicación física opcional (obras, remodelaciones). |
| SolicitudCambio | Process → nuevo proceso SgccSolicitudCambio | especializa | Necesita flujo de evaluación y aprobación. |
| Entregable | DMS Alfresco | nativo | Los archivos del entregable son adjuntos. |

## Conocimiento KN · TR

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| ActivoConocimiento | DMS Alfresco + Site | referencia | Archivo en DMS; contexto físico = Site/Building/Unit. |
| VersionConocimiento | Versionado DMS + historial | nativo |  |
| Taxonomia | Lookup type | nativo | Si necesita atributos propios, clase nueva. |
| CategoriaConocimiento | Lookup values jerárquicos | nativo |  |
| FuenteConocimiento | DMS Alfresco | nativo | Libros, papers, videos y charlas como adjuntos. |
| EventoSocializacion | Reuniones | referencia | Reusa fecha, asunto y edificio. |
| LeccionAprendida | CorrectiveMaint | referencia | Lecciones de incidencias cerradas. |
| CicloConocimiento | Site | referencia | Lugar físico donde se genera o aplica (KN-09). |
| ConsultaTrazabilidad | Grafo de relaciones / API /relations | nativo | Recorre dominios desde cualquier tarjeta. |
| GrafoTrazabilidad | Grafo de relaciones de CMDBuild | nativo |  |
| HistorialElemento | Historial de tarjetas | nativo |  |

## PTE · COMP

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| PTE | CleaningActivity, PrevMaintConfig, MaintenanceManual | referencia | El PTE es el estándar; checklist y configuración preventiva son su forma operativa. |
| FormatoPTE | CleaningActivity (Plantilla) | referencia | La plantilla del checklist ya es un formato. |
| POp | CleaningTask, PreventiveMaint | referencia | Cada limpieza o preventivo ejecutado es un POp de su PTE. |
| HallazgoPTE | CleaningTask (SupervisionObserv), CorrectiveMaint | referencia | Observaciones de supervisión e incidencias como hallazgos. |
| VersionPTE | Versionado DMS + historial | nativo |  |
| RevisionPTE | Workflow (Process) | nativo | Revisión y aprobación como flujo. |
| PerfilCompetencias | RolFuncional (espejo de grupo) | referencia | Ver Rol en ADM. |
| CompetenciaPersona | Employee | referencia |  |
| Participacion | Employee | referencia |  |
| SesionAcompanamiento | Employee | referencia | Coach y aprendiz son empleados. |
| SesionFormacion | Reuniones / calendario | referencia |  |
| ContenidoFormativo | DMS Alfresco | nativo |  |

## Mejora e información GMC · GID

| Clase SGCC | OpenMaint | Vínculo | Nota |
|---|---|---|---|
| Problema | CorrectiveMaint + CI / Asset | referencia | Un problema agrupa una o varias incidencias reales. |
| AnalisisRecurrencia | CorrectiveMaint + MaintCategory / MaintSubcategory + CI | referencia | Recurrencias por categoría, activo o unidad (GMC-09). |
| AccionMejora | MaintProcess | referencia | Una acción puede generar un correctivo o preventivo. |
| Sugerencia | Employee / Tenant | referencia | Autor interno o inquilino desde el portal. |
| Indicador | MaintSLA + reportes de openMAINT | referencia | Fuentes ya existentes (SLA, estadísticas). |
| Dashboard | Dashboards de CMDBuild | nativo |  |
| Widget | Gráficos de dashboard | nativo |  |
| Reporte | Reportes Jasper de CMDBuild | nativo | openMAINT ya trae REP-MaintSLACompliance, REP-MaintenanceStatistics, etc. |

## Dominios nuevos propuestos

| Dominio | Origen | Destino | Cardinalidad |
|---|---|---|---|
| ReunionDecision | Reuniones | Decision | 1:N |
| ActividadMaintProcess | Actividad | MaintProcess | N:N |
| ActividadCleaningTask | Actividad | CleaningTask | N:N |
| PtePrevMaintConfig | PTE | PrevMaintConfig | 1:N |
| PteCleaningActivity | PTE | CleaningActivity | 1:N |
| PteMaintenanceManual | PTE | MaintenanceManual | N:N |
| ProblemaCorrectiveMaint | Problema | CorrectiveMaint | N:N |
| ProblemaCI | Problema | CI | N:N |
| AccionMejoraMaintProcess | AccionMejora | MaintProcess | 1:N |
| LeccionCorrectiveMaint | LeccionAprendida | CorrectiveMaint | N:N |
| EmployeeCompetencia | Employee | CompetenciaPersona | 1:N |
| CompanyUnidadOrg | Company | UnidadOrganizativa | 1:N |
| UnidadOrgTeam | UnidadOrganizativa | Team | 1:N |
| SiteActivoConocimiento | Site | ActivoConocimiento | 1:N |
| EmployeeSugerencia | Employee | Sugerencia | 1:N |
| TenantSugerencia | Tenant | Sugerencia | 1:N |

## Clases SGCC nuevas sin equivalente

- **Núcleo transversal**: MarcoMetodologico, ComponenteMarco
- **ADM**: Proceso
- **Estrategia PGE-RUG-EIE**: PlanEstrategico, AnalisisEstrategico, FactorEstrategico, EstudioProspectivo, Escenario, Tendencia, ObjetivoEstrategico, PrioridadEstrategica, ElementoDesagregado, AsignacionEjecucion, PlanAnualAccion, EvaluacionMadurezRitmos, DimensionRitmo, BrechaMadurez, RequerimientoRecurso, AnalisisEquilibrio
- **Ejecución GDD-GOCP**: PlanGestionDesempeno, CompromisoDesempeno, PlanCortoPlazo, ResultadoActividad
- **Proyectos PRO**: FaseProyecto, Hito, TareaProyecto, Backlog, HistoriaUsuario, Sprint, Cronograma, RegistroRiesgoProblema, EvaluacionImpacto, EvaluacionResultados
- **Conocimiento KN-TR**: ValoracionUtilidad, ElementoCultural, PlanManejoConocimiento, TrazaConocimiento
- **PTE y COMP**: PrioridadLevantamiento, Competencia, CompetenciaRequerida, BrechaCompetencia, PlanDesarrollo, AccionDesarrollo, ProgramaFormacion, EvaluacionAprendizaje
- **Mejora e información GMC-GID**: OportunidadMejora, AnalisisCausa, VerificacionResultado, IniciativaMejora, PlanAnualMejora, MetaMejora, ResultadoMejora, FormulaIndicador, MetaIndicador, MedicionIndicador, AnalisisDesempeno

## Restricciones de CMDBuild a tener en cuenta

- `Activity`, `Process`, `Class`, `Role` y `User` son nombres reservados: la `Actividad` y el `Proceso` del SGCC necesitan otro nombre técnico (p. ej. `SgccActividad`, `ProcesoNegocio`).
- Un proceso no puede heredar de una clase: los elementos con flujo de aprobación (`Plan`, `SolicitudCambio`, `RevisionPTE`) heredan de `Process`, no de `SgccElemento`. Lo común entre ambos se replica como atributos.
- Los grupos (roles) no se pueden referenciar desde una tarjeta; por eso `RolFuncional` como clase espejo.
- `svc-dt4fm` no tiene permiso sobre las clases estándar listadas arriba; habrá que dárselo si el backend las usa.
