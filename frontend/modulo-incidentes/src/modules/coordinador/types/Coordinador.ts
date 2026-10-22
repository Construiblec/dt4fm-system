/**
 * Formas de lo que devuelve el backend para la coordinación de limpiezas.
 * Son las de `GET /cleaning-tasks/all`, el detalle y los endpoints de
 * coordinación (`checkouts/preview`, `employees`, `checklists`).
 */

export type CoordUnit = {
  id: number;
  code: string | null;
  description: string | null;
  name: string | null;
  building: string | null;
  buildingId: number | null;
};

export type CoordEmployee = { id: number; name: string };

/** Una limpieza tal como aparece en los listados. */
export type CoordTask = {
  id: number;
  type: string;
  taskNumber: string;
  description: string | null;
  /** Assigned · InExecution · Completed · Reviewed · Cancelled */
  phase: string;
  generatedDate: string;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  /** Minutos trabajados acumulados. */
  executionTime: number | null;
  delayTime: number | null;
  taskObservations: string | null;
  supervisionObserv: string | null;
  teamObservations: string | null;
  /** La resuelve el backend: OpenMAINT no tiene fase "en pausa". */
  isPaused: boolean;
  hostawayReservation: string | null;
  hostawayListingId: string | null;
  /** Solo la fecha (YYYY-MM-DD). */
  checkoutDate: string | null;
  /** "Hostaway" o "Manual". */
  source: string | null;
  unit: CoordUnit | null;
  employee: CoordEmployee | null;
  checklist: { id: number; description: string | null } | null;
};

export type ChecklistDetail = {
  id: number;
  code: string | null;
  description: string | null;
  templateName: string | null;
  /** Una fila de CSV por elemento (`Titulo,Actividad,Minutos`). */
  activities: string[];
};

/** La ficha completa. */
export type CoordTaskDetail = CoordTask & {
  checklistDetail: ChecklistDetail | null;
  cancelReason: string | null;
};

export type CoordTeam = { id: number; name: string };

export type EmployeeOption = {
  id: number;
  name: string;
  team: CoordTeam | null;
};

export type ChecklistTemplateFile = {
  fileName: string | null;
  size: number | null;
  encoding: string | null;
  /** Falso si el archivo no se pudo leer y se está usando el Detalle. */
  readable: boolean;
  error: string | null;
};

export type Checklist = {
  id: number;
  code: string | null;
  description: string | null;
  templateName: string | null;
  detalle: string;
  plantilla: ChecklistTemplateFile | null;
  activities: string[];
  source: "archivo" | "detalle";
};

export type CheckoutStatus = "por-crear" | "creada" | "cambio" | "huerfana";

export type CheckoutRow = {
  reservationId: string;
  listingId: string;
  listingName: string;
  /** Lo que dice la limpieza si ya existe; si no, la fecha de Hostaway. */
  checkoutDate: string;
  /** Lo que dice Hostaway hoy; null si la reserva ya no está. */
  hostawayCheckoutDate: string | null;
  checkoutTime: string | null;
  status: CheckoutStatus;
  unitMatch: "ok" | "none" | "ambiguous";
  task: CoordTask | null;
};

export type CheckoutPreview = {
  dateFrom: string;
  dateTo: string;
  count: number;
  rows: CheckoutRow[];
};

export type SyncError = {
  reservationId: string;
  listingName: string;
  message: string;
};

export type SyncResult = {
  dateFrom: string;
  dateTo: string;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: SyncError[];
};

/** Lo que el formulario de la ficha puede mandar a `PUT /cleaning-tasks/:id`. */
export type UpdateTaskPayload = {
  description?: string;
  checkoutDate?: string;
  unitId?: number | null;
  plannedStartTime?: string;
  plannedEndTime?: string;
  employeeId?: number;
  cleaningChecklistId?: number | null;
  observations?: string | null;
};

export type CreateManualTaskPayload = {
  description: string;
  plannedStartTime: string;
  plannedEndTime: string;
  unitId?: number;
  employeeId?: number;
  cleaningChecklistId?: number;
  observations?: string;
};

/** Sin `code`: el formulario ya no lo pide y el backend no toca el `Code` que no llega. */
export type SaveChecklistPayload = {
  templateName: string;
  description: string;
  detalle: string;
  /** Archivo nuevo; si falta, se conserva el que hubiera. */
  file: File | null;
  removeTemplate: boolean;
};
