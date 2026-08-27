import type { SupervisedMaintenance } from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import type { MaintenanceCardData } from "@/shared/components/MaintenanceCard";

/**
 * Adapta el contrato del supervisor a la vista mínima que pide la tarjeta
 * compartida. La conversión vive aquí y no en `MaintenanceCard` para que el
 * componente de `shared/` no dependa de los tipos de un módulo concreto.
 */
export const toCardData = (
  maintenance: SupervisedMaintenance,
): MaintenanceCardData => ({
  id: maintenance.id,
  kind: maintenance.kind,
  number: maintenance.number,
  subject: maintenance.subject,
  statusCode: maintenance.statusCode,
  status: maintenance.status,
  site: maintenance.site,
  // El listado del supervisor no trae equipo/activo ni ubicación fina: el
  // asunto ya describe el trabajo, así que la fila se omite.
  target: null,
  assignee: maintenance.assignee?.name ?? null,
  priorityCode: maintenance.priority?.code ?? null,
  openingDate: maintenance.openingDate,
  plannedStart: maintenance.plannedStart,
  dueDate: maintenance.dueDate,
  isOverdue: maintenance.isOverdue,
});
