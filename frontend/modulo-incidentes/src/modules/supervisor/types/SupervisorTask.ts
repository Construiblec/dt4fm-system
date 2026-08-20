import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";

export type GetAllCleaningTasksParams = {
  phase?: string;
  date?: string;
  employeeId?: number;
  limit?: number;
  offset?: number;
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

export type ReviewTaskPayload = {
  approved: boolean;
  reviewComments?: string;
};

export type ReviewTaskResponse = {
  success: boolean;
  data: {
    id: number;
    phase: string;
    reviewComments: string | null;
  };
};

// ─── Detalle de tarea ─────────────────────────────────────────────────────────

export type TaskAttachment = {
  id: string;
  category: string;
  uploadDate: string;
  downloadUrl: string;
};

export type ChecklistDetail = {
  id: number;
  code: string;
  description: string;
  templateName: string;
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
  canReview: boolean;
  canReopen: boolean;
  canCancel: boolean;
  checklistDetail: ChecklistDetail | null;
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
