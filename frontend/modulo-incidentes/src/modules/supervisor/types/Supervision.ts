/**
 * Supervisión posterior de limpieza (`/cleaning-supervisions`).
 *
 * Solo se guardan las novedades (lo que está mal); los puntos correctos no
 * dejan rastro, así que no hay «conforme» ni «no aplica».
 */

export type SupervisionPhase =
  | "Draft"
  | "InCorrection"
  | "Fixed"
  | "Confirmed"
  | "Approved"
  | "Cancelled";

export type SupervisionPoint = {
  /** Número de fila del CSV: lo guarda la novedad en `Index`. */
  index: number;
  area: string;
  areaGuide: string;
  name: string;
  criterion: string;
};

export type SupervisionArea = {
  name: string;
  guide: string;
  points: SupervisionPoint[];
};

export type SupervisionPhoto = {
  id: string;
  fileName: string | null;
  uploadDate: string | null;
  downloadUrl: string;
};

export type SupervisionFinding = {
  id: number;
  index: number | null;
  point: { area: string; name: string; criterion: string } | null;
  subcategory: { id: number; name: string; isOther: boolean } | null;
  observation: string | null;
  /** El supervisor la resolvió al momento: no va a corrección. */
  resolvedBySupervisor: boolean;
  photos: SupervisionPhoto[];
  /** Solo en el cliente: la acción todavía no terminó en el servidor. */
  syncing?: "creating" | "saving" | "deleting";
};

/**
 * Foto elegida que todavía no confirmó openMAINT. Vive solo en el cliente:
 * se muestra con su miniatura local mientras sube, o con «No se subió».
 */
export type LocalPhoto = {
  localId: string;
  previewUrl: string;
  file: File;
  status: "uploading" | "failed";
};

export type SupervisionDetail = {
  id: number;
  phase: SupervisionPhase | null;
  phaseLabel: string | null;
  task: {
    id: number;
    taskNumber?: string | null;
    description?: string | null;
    phase?: string;
    actualEndTime?: string | null;
    employee?: { id: number; name: string } | null;
  } | null;
  unit: { id: number; description: string | null } | null;
  corrector: { id: number; name: string } | null;
  supervisor: { id: number; name: string } | null;
  checklist: {
    id: number | null;
    totalPoints: number;
    areas: SupervisionArea[];
  };
  findings: SupervisionFinding[];
  /** Lo que el usuario conectado puede hacer ahora; lo decide el backend. */
  can: {
    start: boolean;
    editFindings: boolean;
    assign: boolean;
    confirm: boolean;
    approve: boolean;
    markFixed: boolean;
  };
};

export type SupervisionSummary = {
  id: number;
  phase: SupervisionPhase | null;
  phaseLabel: string | null;
  corrector: { id: number; name: string } | null;
};

export type SupervisionTemplate = {
  checklistId: number;
  description: string | null;
  totalPoints: number;
  areas: SupervisionArea[];
};

/** Motivo del 409 al abrir una limpieza que no se supervisa. */
export type SupervisionUnavailableReason =
  | "legacy"
  | "superseded"
  | "disabled"
  | "reviewed";

export type FindingInput = {
  index: number;
  subcategoryId: number;
  observation?: string;
  resolvedBySupervisor?: boolean;
};

/** Una supervisión en corrección asignada al operario (`GET /mine`). */
export type MyCorrection = {
  id: number;
  taskId: number | null;
  taskNumber: string | null;
  actualEndTime: string | null;
  unit: { id: number; description: string | null } | null;
  buildingName: string | null;
  supervisor: string | null;
  phase: SupervisionPhase | null;
  /** Solo las que no resolvió el supervisor: las que tiene que corregir. */
  findingsCount: number;
};

export type CleaningEmployee = {
  id: number;
  name: string;
  team: { id: number; name: string } | null;
};

export type ApiEnvelope<T> = { success: boolean; data: T };
