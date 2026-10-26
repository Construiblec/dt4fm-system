# SGCC v2: modelo simplificado sobre OpenMaint

v1: 130 clases y 39 enumeraciones. v2: 33 elementos nuevos, 18 clases de OpenMaint reutilizadas y 12 funciones nativas de CMDBuild. Los 90 RF siguen cubiertos.

Archivos: `SGCC_diagrama_clases_v2.drawio` (diseño) y `SGCC_modelo_dominio_v2.drawio` (conceptual).

## Elementos nuevos

| Elemento | Tipo | Hereda de | Sustituye a (v1) |
|---|---|---|---|
| ElementoGestion | abstract |  | ElementoGestion |
| MarcoMetodologico | class |  | MarcoMetodologico |
| ComponenteMarco | class |  | ComponenteMarco |
| VinculoTrazabilidad | domain |  | VinculoTrazabilidad, TrazaConocimiento |
| Decision | class |  | Decision |
| Aprobacion | process | Process | FlujoTrabajo, SolicitudCambio, RevisionPTE |
| UnidadOrganizativa | class |  | UnidadOrganizativa |
| ProcesoNegocio | class | ElementoGestion | Proceso |
| RolFuncional | class |  | Rol, PerfilCompetencias |
| Plan | class | ElementoGestion | Plan, PlanEstrategico, PlanAnualAccion, PlanGestionDesempeno, PlanCortoPlazo, PlanManejoConocimiento, PlanDesarrollo, PlanAnualMejora |
| ElementoPlan | class | ElementoGestion | ObjetivoEstrategico, PrioridadEstrategica, ElementoDesagregado, CompromisoDesempeno, IniciativaMejora, MetaMejora |
| Actividad | class | ElementoGestion | Actividad, CausaNoEjecucion, Hito, TareaProyecto, Backlog, HistoriaUsuario, POp, AccionDesarrollo, AccionMejora |
| RegistroEjecucion | class |  | RegistroEjecucion, MedicionEstabilidad |
| Resultado | class |  | ResultadoActividad, Entregable, EvaluacionResultados, VerificacionResultado, ResultadoMejora |
| AsignacionRecurso | class |  | AsignacionEjecucion, Recurso, RequerimientoRecurso, InversionEstrategica, CapacidadPersona |
| Analisis | class | ElementoGestion | AnalisisEstrategico, EstudioProspectivo, EvaluacionMadurezRitmos, AnalisisEquilibrio, AnalisisCausa, AnalisisRecurrencia, AnalisisDesempeno |
| FactorAnalisis | class |  | FactorEstrategico, Escenario, Tendencia, DimensionRitmo, BrechaMadurez, AnalisisCausa |
| Proyecto | class | ElementoGestion | Proyecto, Cronograma |
| FaseProyecto | class | ElementoGestion | FaseProyecto, Sprint |
| SolicitudCambio | class | ElementoGestion | SolicitudCambio, EvaluacionImpacto |
| Hallazgo | class | ElementoGestion | Desviacion, RegistroRiesgoProblema, HallazgoPTE, Sugerencia, OportunidadMejora, Problema |
| Indicador | class | ElementoGestion | Indicador, FormulaIndicador |
| MedicionIndicador | class |  | MetaIndicador, MedicionIndicador |
| ActivoConocimiento | class | ElementoGestion | ActivoConocimiento, ElementoCultural, LeccionAprendida |
| ValoracionUtilidad | class |  | ValoracionUtilidad |
| CicloConocimiento | class |  | CicloConocimiento |
| PTE | class | ElementoGestion | PTE, PrioridadLevantamiento |
| VersionPTE | class |  | VersionPTE, RevisionPTE |
| Competencia | class |  | Competencia |
| CompetenciaRequerida | class |  | CompetenciaRequerida |
| CompetenciaPersona | class |  | CompetenciaPersona |
| ProgramaFormacion | class | ElementoGestion | ProgramaFormacion |
| Participacion | domain |  | Participacion, EvaluacionAprendizaje |

## OpenMaint reutilizado

| Clase | Sustituye a (v1) |
|---|---|
| Company | Organizacion |
| Employee | Persona, Recurso, CapacidadPersona |
| User | Usuario |
| Budget | InversionEstrategica, PresupuestoProyecto |
| BudgetItem | InversionEstrategica, PartidaCosto |
| AccountingMov | PartidaCosto |
| MaintProcess | POp |
| CleaningTask | POp |
| CI | Recurso |
| Consumable | Recurso |
| Supplier | Proveedor |
| PurchaseOrder | Adquisicion |
| Site | contexto físico |
| Tenant | autor de sugerencias |
| MaintSLA | fuente de indicadores |
| CleaningActivity | FormatoPTE |
| PrevMaintConfig | formato operativo del PTE |
| Reuniones | CicloRevision, EventoSocializacion, SesionFormacion, SesionAcompanamiento |

## Funciones nativas de CMDBuild

| Función | Sustituye a (v1) |
|---|---|
| Grupos y privilegios | Perfil, Permiso |
| Lookups | Catalogo, ValorCatalogo, Taxonomia, CategoriaConocimiento y las 39 enumeraciones |
| Parameter (OpenMaint) | ParametroSistema |
| Workflow | FlujoTrabajo, EtapaFlujo, TransicionFlujo, InstanciaFlujo |
| Funciones y form triggers | ReglaNegocio |
| DMS Alfresco | Documento, VersionDocumento, Evidencia, FuenteConocimiento, ContenidoFormativo, FormatoPTE, VersionConocimiento |
| Historial de tarjetas | RegistroCambio, RegistroAuditoria, HistorialElemento |
| Grafo de relaciones | ConsultaTrazabilidad, GrafoTrazabilidad |
| Import/export y ETL | InterfazIntegracion, OperacionIntercambio |
| Notificaciones (EmailTemplate, HistorialEmail) | Recordatorio |
| Dashboards y reportes | Dashboard, Widget, Reporte |
| Vistas SQL | MedicionEstabilidad, Cronograma, Backlog, BrechaCompetencia, CapacidadPersona |

## Matriz RF → clases v2

| RF | Clases v2 |
|---|---|
| ADM-01 | Company (OpenMaint), UnidadOrganizativa, ProcesoNegocio, RolFuncional, Grupos y privilegios (CMDBuild) |
| ADM-02 | RolFuncional, Grupos y privilegios (CMDBuild), Employee (OpenMaint), User (OpenMaint) |
| ADM-03 | ElementoGestion, Lookups (CMDBuild), Funciones y form triggers (CMDBuild), Parameter (OpenMaint) (CMDBuild) |
| ADM-04 | ProcesoNegocio, Funciones y form triggers (CMDBuild), Workflow (CMDBuild), Aprobacion |
| ADM-05 | ElementoGestion, DMS Alfresco (CMDBuild) |
| ADM-06 | Grupos y privilegios (CMDBuild), Import/export y ETL (CMDBuild) |
| ADM-07 | ElementoGestion, Historial de tarjetas (CMDBuild) |
| PGE-01 | Analisis, FactorAnalisis |
| PGE-02 | Analisis, FactorAnalisis |
| PGE-03 | ElementoPlan |
| PGE-04 | MarcoMetodologico, ComponenteMarco, ElementoPlan |
| PGE-05 | ElementoPlan, Indicador, MedicionIndicador |
| PGE-06 | ElementoPlan, AsignacionRecurso |
| PGE-07 | Plan, Decision, Historial de tarjetas (CMDBuild), Workflow (CMDBuild), Aprobacion, Reuniones (OpenMaint) |
| RUG-01 | Analisis, FactorAnalisis |
| EIE-01 | ElementoPlan, AsignacionRecurso, Employee (OpenMaint), CI (OpenMaint), Consumable (OpenMaint) |
| EIE-02 | Budget (OpenMaint), BudgetItem (OpenMaint), AsignacionRecurso |
| EIE-03 | Employee (OpenMaint), AsignacionRecurso, Vistas SQL (CMDBuild) |
| EIE-04 | Analisis, Dashboards y reportes (CMDBuild) |
| GDD-01 | Plan, ElementoPlan |
| GDD-02 | Decision, Reuniones (OpenMaint), Hallazgo, Actividad |
| GOCP-01 | Plan, Actividad |
| GOCP-02 | AsignacionRecurso, Employee (OpenMaint), CI (OpenMaint), Consumable (OpenMaint), Actividad, Notificaciones (EmailTemplate, HistorialEmail) (CMDBuild) |
| GOCP-03 | RegistroEjecucion, Vistas SQL (CMDBuild) |
| GOCP-04 | DMS Alfresco (CMDBuild), Hallazgo, Resultado, Actividad, Lookups (CMDBuild) |
| PRO-01 | Proyecto |
| PRO-02 | FaseProyecto, Actividad, Resultado |
| PRO-03 | Actividad, Vistas SQL (CMDBuild), FaseProyecto |
| PRO-04 | Actividad, FaseProyecto, Vistas SQL (CMDBuild), Proyecto |
| PRO-05 | AsignacionRecurso, Employee (OpenMaint), CI (OpenMaint), Consumable (OpenMaint), Hallazgo, Budget (OpenMaint), BudgetItem (OpenMaint), AccountingMov (OpenMaint), PurchaseOrder (OpenMaint), Supplier (OpenMaint) |
| PRO-06 | Hallazgo |
| PRO-07 | SolicitudCambio, Aprobacion |
| PRO-08 | DMS Alfresco (CMDBuild) |
| PRO-09 | Decision |
| PRO-10 | Resultado |
| PRO-11 | ActivoConocimiento |
| PRO-12 | VinculoTrazabilidad, Proyecto |
| PRO-13 | MarcoMetodologico, ComponenteMarco |
| KN-01 | ActivoConocimiento |
| KN-02 | ActivoConocimiento |
| KN-03 | Lookups (CMDBuild) |
| KN-04 | DMS Alfresco (CMDBuild) |
| KN-05 | DMS Alfresco (CMDBuild), Historial de tarjetas (CMDBuild), ValoracionUtilidad |
| KN-06 | VinculoTrazabilidad, ActivoConocimiento |
| KN-07 | Reuniones (OpenMaint), ActivoConocimiento |
| KN-08 | ActivoConocimiento |
| KN-09 | Plan, MarcoMetodologico, DMS Alfresco (CMDBuild), Historial de tarjetas (CMDBuild), CicloConocimiento |
| TR-01 | VinculoTrazabilidad, Grafo de relaciones (CMDBuild) |
| TR-02 | VinculoTrazabilidad |
| TR-03 | VinculoTrazabilidad, Grafo de relaciones (CMDBuild) |
| TR-04 | VinculoTrazabilidad |
| TR-05 | ElementoGestion, Decision, Historial de tarjetas (CMDBuild) |
| TR-06 | VinculoTrazabilidad, Grafo de relaciones (CMDBuild) |
| PTE-01 | PTE, DMS Alfresco (CMDBuild), CleaningActivity (OpenMaint) |
| PTE-02 | Workflow (CMDBuild), Aprobacion, Reuniones (OpenMaint), VersionPTE |
| PTE-03 | VinculoTrazabilidad, PTE |
| PTE-04 | Actividad, CleaningTask (OpenMaint), MaintProcess (OpenMaint) |
| PTE-05 | Hallazgo |
| PTE-06 | VersionPTE |
| PTE-07 | DMS Alfresco (CMDBuild), VersionPTE, Aprobacion |
| PTE-08 | PTE |
| COMP-01 | RolFuncional, Grupos y privilegios (CMDBuild), Competencia, CompetenciaRequerida |
| COMP-02 | Employee (OpenMaint), CompetenciaPersona |
| COMP-03 | Vistas SQL (CMDBuild) |
| COMP-04 | Plan, Actividad |
| COMP-05 | Actividad, ProgramaFormacion |
| COMP-06 | ProgramaFormacion, DMS Alfresco (CMDBuild) |
| COMP-07 | Reuniones (OpenMaint), Participacion |
| COMP-08 | DMS Alfresco (CMDBuild) |
| COMP-09 | DMS Alfresco (CMDBuild), Participacion |
| COMP-10 | CompetenciaPersona, Plan |
| COMP-11 | MarcoMetodologico, Reuniones (OpenMaint) |
| COMP-12 | VinculoTrazabilidad, Competencia |
| GMC-01 | Hallazgo |
| GMC-02 | DMS Alfresco (CMDBuild), Hallazgo, Analisis, FactorAnalisis, Actividad, Resultado |
| GMC-03 | ElementoPlan |
| GMC-04 | Plan, Decision, Historial de tarjetas (CMDBuild), ElementoPlan |
| GMC-05 | Hallazgo |
| GMC-06 | ActivoConocimiento, Resultado |
| GMC-07 | VinculoTrazabilidad |
| GMC-08 | MarcoMetodologico, ComponenteMarco |
| GMC-09 | Analisis |
| GID-01 | Indicador |
| GID-02 | Indicador, MedicionIndicador |
| GID-03 | Dashboards y reportes (CMDBuild) |
| GID-04 | Dashboards y reportes (CMDBuild) |
| GID-05 | MedicionIndicador, Analisis |
| GID-06 | VinculoTrazabilidad, Indicador |
| GID-07 | Analisis |
| GID-08 | MarcoMetodologico, Dashboards y reportes (CMDBuild) |

## Notas de implementación

- `Actividad` y `ProcesoNegocio` necesitan nombres técnicos distintos de `Activity` y `Process` (reservados): p. ej. `SgccActividad`.
- `ElementoGestion` se crea como superclase prototipo (`SgccElemento`), igual que `CI` en openMAINT; así `VinculoTrazabilidad` y `Aprobacion` funcionan para todas las subclases con un solo dominio.
- `Reuniones` se amplía con tipo, lugar, facilitador, programa, método, observaciones y siguiente paso; `Participacion` es el dominio Reuniones ↔ Employee con atributos.
- `svc-dt4fm` necesita permiso de lectura/escritura sobre Company, Team, Supplier, Budget, BudgetItem, AccountingMov, PurchaseOrder, Consumable, PrevMaintConfig, MaintSLA y Parameter.
