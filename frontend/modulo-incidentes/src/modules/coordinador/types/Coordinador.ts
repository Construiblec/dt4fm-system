import type {
  CleaningTask,
  CleaningTaskEmployee,
  CleaningTaskUnit,
} from "@/modules/incidentes/types/CleaningTask";

/**
 * Tarea `Assigned` sin fecha planificada ni empleado. El tipo base
 * (`CleaningTask`) declara `employee` no-nulo y `plannedStartTime` como
 * string obligatorio, pero el backend sí devuelve null en ambos para estas
 * tareas — es justo la condición que arma "Pendientes por Asignar". Se
 * extiende acá en vez de tocar el tipo compartido (lo usan supervisor y
 * asistente-sl, que nunca filtran por Assigned sin empleado).
 */
export type PendingCleaningTask = Omit<
  CleaningTask,
  "employee" | "plannedStartTime" | "plannedEndTime"
> & {
  employee: CleaningTaskEmployee | null;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
};

export type CleaningEmployee = {
  id: number;
  name: string;
  team: { id: number; name: string } | null;
};

export type ChecklistTemplate = {
  id: number;
  code: string | null;
  description: string | null;
  templateName: string | null;
  activities: string[];
};

export type CreateChecklistTemplatePayload = {
  templateName: string;
  detail: string;
  code?: string;
  description?: string;
};

/** Completa una tarea "Pendiente por Asignar" (PUT /cleaning-tasks/:id). */
export type AssignPendingTaskPayload = {
  unitId: number;
  plannedStartTime: string;
  plannedEndTime: string;
  employeeId: number;
  cleaningChecklistId?: number;
  observations?: string;
};

/** Crea una limpieza manual completa desde cero (POST /cleaning-tasks/manual). */
export type CreateManualTaskPayload = {
  unitId: number;
  employeeId: number;
  plannedStartTime: string;
  plannedEndTime: string;
  description: string;
  cleaningChecklistId?: number;
  observations?: string;
};

export type CheckoutItem = {
  reservationId: string;
  guestName: string;
  listingName: string;
  listingId: string;
  checkoutDate: string;
  checkoutTime: string;
};

export type GetCheckoutsResponse = {
  date: string;
  dateFrom: string;
  dateTo: string;
  checkouts: CheckoutItem[];
  count: number;
};

export type SyncResult = {
  dateFrom: string;
  dateTo: string;
  total: number;
  created: number;
  skipped: number;
  failed: number;
};

export type UnitOption = CleaningTaskUnit;
