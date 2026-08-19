import type { CleaningTask, CleaningTaskUnit } from "@/modules/incidentes/types/CleaningTask";

export type CleaningChecklistDetail = {
  id: number;
  code: string;
  description: string;
  templateName: string;
  activities: string[];
};

export type CleaningTaskAttachment = {
  id?: number | string;
  url?: string;
  fileUrl?: string;
  path?: string;
  /** Ruta relativa al endpoint que sirve el binario. Con ella se pinta la foto. */
  downloadUrl?: string;
  fileName?: string;
  description?: string | null;
  category?: string | null;
  mimeType?: string | null;
  uploadDate?: string | null;
};

export type CleaningTaskExecutionDetail = CleaningTask & {
  phaseId?: number;
  canStart?: boolean;
  canComplete?: boolean;
  canPause?: boolean;
  canReview?: boolean;
  canCancel?: boolean;
  checklistDetail: CleaningChecklistDetail | null;
  attachments: CleaningTaskAttachment[];
  unit: CleaningTaskUnit | null;
  /**
   * Lo que el empleado llevaba escrito en "Observaciones" cuando pausó. Vuelve al
   * campo de escritura al reanudar; no es una observación registrada y no se
   * muestra en ninguna otra vista.
   */
  draftObservations?: string | null;
};

export type ActiveCleaningTask = {
  id: number;
  taskNumber: string;
  description: string;
  phase: string;
  actualStartTime: string | null;
  /**
   * Momento exacto en que el empleado tocó "Iniciar" en la tarjeta. Es el cero del
   * cronómetro y la base del tiempo que se acumula en ExecutionTime. No tiene
   * relación con la sesión de login ni con actualStartTime (que en una tarea
   * reabierta sigue apuntando al primer inicio histórico).
   */
  executionStartedAt?: string;
  /**
   * El mismo instante, pero resuelto por el backend desde OpenMAINT. Manda sobre
   * `executionStartedAt` siempre que exista: es lo que hace que el cronómetro sea
   * idéntico en cualquier ventana o dispositivo, y que sobreviva a una recarga.
   */
  sessionStartedAt?: string | null;
  /**
   * Minutos que la tarea ya tenía registrados en OpenMAINT (ExecutionTime) cuando
   * arrancó esta sesión. Es la base del total que se reporta al finalizar o pausar:
   * ese total REEMPLAZA a ExecutionTime, no se le suma.
   */
  accumulatedMinutes?: number;
  /**
   * Minutos con los que arranca el CRONÓMETRO, que no siempre es lo mismo: al
   * reanudar una pausa vale lo acumulado, y al reabrir una tarea vale cero para que
   * el conteo empiece de nuevo aunque por debajo el tiempo se siga sumando.
   */
  sessionBaseMinutes?: number;
  plannedStartTime: string;
  plannedEndTime: string;
  unitDescription?: string;
};

export type CleaningTaskExecutionApiResponse<T> = {
  success: boolean;
  data: T;
};

export type CleaningTaskStartResponse = CleaningTaskExecutionApiResponse<CleaningTaskExecutionDetail>;

export type CleaningTaskDetailResponse = CleaningTaskExecutionApiResponse<CleaningTaskExecutionDetail>;

export type CleaningTaskUploadResponse = {
  success?: boolean;
  data?: {
    id?: number | null;
    fileName?: string;
    category?: string;
    uploadDate?: string;
    url?: string;
    fileUrl?: string;
    path?: string;
    downloadUrl?: string;
  };
  url?: string;
  fileUrl?: string;
  path?: string;
};

export type CleaningTaskCompleteResponse = {
  success: boolean;
  message?: string;
};

export type CleaningTaskPauseResponse = {
  success: boolean;
  data?: {
    id?: number;
    phase?: string;
    isPaused?: boolean;
    reason?: string;
    /** Total acumulado que quedó guardado en OpenMAINT al pausar. */
    executionTime?: number;
  };
  message?: string;
};
