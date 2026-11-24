import type { AttachmentOrigin } from './constants/supervision-evidence.constants';

/** Prefijo público de la API; las URLs de descarga cuelgan de aquí. */
export const CLEANINGS_API_BASE_PATH = '/integrations/v1/cleanings';

export type CleaningReadFilters = {
  phase?: string;
  /** Día de generación, YYYY-MM-DD. */
  date?: string;
  plannedFrom?: string;
  plannedTo?: string;
  endedFrom?: string;
  endedTo?: string;
  employeeId?: number;
  unitId?: number;
  limit: number;
  offset: number;
};

export type CleaningReadPerson = { id: number; name: string };

export type CleaningReadUnit = {
  id: number;
  code: string | null;
  description: string | null;
  name: string | null;
  building: string | null;
  buildingId: number | null;
};

export type CleaningReadSupervisionSummary = {
  id: number;
  phase: string | null;
  phaseLabel: string | null;
  corrector: CleaningReadPerson | null;
};

export type CleaningReadWarning = 'unit_unavailable' | 'checklist_unavailable';

export type CleaningReadItem = {
  id: number;
  type: string;
  taskNumber: string | null;
  description: string | null;
  phase: string;
  isPaused: boolean;
  source: string | null;
  generatedDate: string | null;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  executionTime: number | null;
  delayTime: number | null;
  sessionStartedAt: string | null;
  sessionBaseMinutes: number;
  taskObservations: string | null;
  supervisionObserv: string | null;
  teamObservations: string | null;
  hostawayReservation: string | null;
  hostawayListingId: string | null;
  checkoutDate: string | null;
  unitId: number | null;
  unit: CleaningReadUnit | null;
  employee: CleaningReadPerson | null;
  checklist: { id: number; description: string | null } | null;
  /** La última; null = la limpieza no tiene. Un fallo de lectura es error, no null. */
  supervision: CleaningReadSupervisionSummary | null;
  warnings: CleaningReadWarning[];
};

export type CleaningReadAttachment = {
  id: string;
  fileName: string | null;
  category: string | null;
  description: string | null;
  origin: AttachmentOrigin;
  uploadDate: string | null;
  downloadUrl: string;
};

export type CleaningReadPhoto = {
  id: string;
  fileName: string | null;
  uploadDate: string | null;
  downloadUrl: string;
};

export type CleaningReadFinding = {
  id: number;
  index: number | null;
  point: { area: string; name: string; criterion: string } | null;
  subcategory: { id: number; name: string | null } | null;
  observation: string | null;
  resolvedBySupervisor: boolean;
  photos: CleaningReadPhoto[];
  fixPhotos: CleaningReadPhoto[];
};

export type CleaningReadSupervision = CleaningReadSupervisionSummary & {
  supervisor: CleaningReadPerson | null;
  checklistId: number | null;
  findings: CleaningReadFinding[];
};

export type CleaningReadDetail = Omit<CleaningReadItem, 'checklist'> & {
  cancelReason: string | null;
  notes: string | null;
  checklist: {
    id: number;
    code: string | null;
    description: string | null;
    activities: string[];
  } | null;
  attachments: CleaningReadAttachment[];
  /** Todas, la más reciente primero. */
  supervisions: CleaningReadSupervision[];
};

export type CleaningReadFile = {
  data: Buffer;
  contentType: string;
  fileName: string | null;
};

/**
 * Lectura completa con la sesión de servicio. Errores: NotFoundException (404),
 * BadGatewayException (502), ServiceUnavailableException (503),
 * GatewayTimeoutException (504).
 */
export interface CleaningReadContract {
  list(
    filters: CleaningReadFilters,
  ): Promise<{ items: CleaningReadItem[]; total: number | null }>;
  detail(id: number): Promise<CleaningReadDetail>;
  attachment(id: number, attachmentId: string): Promise<CleaningReadFile>;
  findingPhoto(
    id: number,
    supervisionId: number,
    findingId: number,
    photoId: string,
  ): Promise<CleaningReadFile>;
}
