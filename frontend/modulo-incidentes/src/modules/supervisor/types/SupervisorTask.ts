import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import type { SupervisionSummary } from "@/modules/supervisor/types/Supervision";

export type GetAllCleaningTasksParams = {
  phase?: string;
  /** Terminaron desde este instante, incluido (ISO), por fecha de fin. */
  endedFrom?: string;
  /** Terminaron antes de este instante, excluido (ISO). Con `endedFrom` es un día. */
  endedTo?: string;
  employeeId?: number;
  limit?: number;
  offset?: number;
  /** Las recién creadas primero, para que el límite no deje fuera las nuevas. */
  sort?: "newest";
};

export type GetAllCleaningTasksResponse = {
  success: boolean;
  data: CleaningTask[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
};

// ─── Detalle de tarea ─────────────────────────────────────────────────────────

/**
 * Quién aportó la foto: el operario al ejecutar, o el supervisor al revisar.
 * Lo resuelve el backend; ninguna vista debe deducirlo de la descripción.
 */
export type AttachmentOrigin = "supervision" | "execution";

export type TaskAttachment = {
  id: string;
  fileName?: string;
  category: string;
  origin: AttachmentOrigin;
  uploadDate: string;
  downloadUrl: string;
};

export type SupervisionEvidenceResponse = {
  success: boolean;
  data: {
    id: string | null;
    fileName: string;
    category: string;
    origin: AttachmentOrigin;
    uploadDate: string;
  };
};

export type ChecklistDetail = {
  id: number;
  code: string;
  description: string;
  activities: string[];
};

export type CleaningTaskDetail = {
  id: number;
  type: string;
  taskNumber: string;
  description: string;
  phase: string;
  phaseId: number;
  generatedDate: string;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  /** Tiempo trabajado acumulado, en minutos. */
  executionTime: number | null;
  /** Retraso del primer inicio respecto a lo planificado, en minutos. */
  delayTime: number | null;
  taskObservations: string | null;
  supervisionObserv: string | null;
  teamObservations: string | null;
  /** Pausada por el empleado: volvió a Assigned con la marca [Pausado]. */
  isPaused: boolean;
  /** Arranque de la ejecución en curso; null si la tarea no está corriendo. */
  sessionStartedAt: string | null;
  /** Minutos con los que arrancó el cronómetro de la ejecución en curso. */
  sessionBaseMinutes: number;
  hostawayReservation: string | null;
  checkoutDate: string | null;
  source: string;
  unit: { id: number; code: string; description: string; name: string } | null;
  employee: { id: number; name: string } | null;
  attachments: Omit<TaskAttachment, "downloadUrl">[];
  canStart: boolean;
  canComplete: boolean;
  /** Siempre `false`: aprobar pasa por la supervisión. */
  canReview: boolean;
  canReopen: boolean;
  canCancel: boolean;
  checklistDetail: ChecklistDetail | null;
  /** Última supervisión (solo para supervisión y coordinación). */
  supervision?: SupervisionSummary | null;
};

export type ReopenTaskPayload = {
  observations?: string;
};

export type ReopenTaskResponse = {
  success: boolean;
  data: {
    id: number;
    phase: string;
    observations: string | null;
    previousPhase: string;
  };
};

export type GetTaskDetailResponse = {
  success: boolean;
  data: CleaningTaskDetail;
};

export type GetTaskAttachmentsResponse = {
  success: boolean;
  data: TaskAttachment[];
  meta: { total: number };
};
