import type { CleaningTask, CleaningTaskUnit } from "@/modules/incidentes/types/CleaningTask";

export type CleaningChecklistDetail = {
  id: number;
  code: string;
  description: string;
  templateName: string;
  activities: string[];
};

export type CleaningTaskAttachment = {
  id?: number;
  url?: string;
  fileUrl?: string;
  path?: string;
  downloadUrl?: string;
  fileName?: string;
  description?: string | null;
  category?: string | null;
  mimeType?: string | null;
};

export type CleaningTaskExecutionDetail = CleaningTask & {
  phaseId?: number;
  canStart?: boolean;
  canComplete?: boolean;
  canReview?: boolean;
  canCancel?: boolean;
  checklistDetail: CleaningChecklistDetail | null;
  attachments: CleaningTaskAttachment[];
  unit: CleaningTaskUnit | null;
};

export type ActiveCleaningTask = {
  id: number;
  taskNumber: string;
  description: string;
  phase: string;
  actualStartTime: string;
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
