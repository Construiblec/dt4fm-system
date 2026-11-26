import type { RegisterLogEntry } from '../../common/utils/openmaint-register.util';

/** Prefijo público de la API; las URLs de descarga cuelgan de aquí. */
export const MAINTENANCE_API_BASE_PATH = '/integrations/v1';

export type MaintenanceKind = 'corrective' | 'preventive';

export const CORRECTIVE_PRIORITIES = [
  'Critical',
  'High',
  'Medium',
  'Low',
] as const;

export type MaintenanceRef = { id: number; name: string | null };

/** Avisos de lectura; los de escritura se suman en su propio paso. */
export type MaintenanceWarning = 'pending_review' | 'checklist_unavailable';

/** Rangos `[desde, hasta)` en instantes ISO 8601 (UTC). */
type RangeFilters = {
  openedFrom?: string;
  openedTo?: string;
  plannedFrom?: string;
  plannedTo?: string;
  startedFrom?: string;
  startedTo?: string;
  endedFrom?: string;
  endedTo?: string;
};

type CommonFilters = RangeFilters & {
  /** Un solo valor; en correctivos admite además `Assigned`. */
  status?: string;
  /** `false` = sin cesionario. */
  assigned?: boolean;
  employeeId?: number;
  teamId?: number;
  buildingId?: number;
  limit: number;
  offset: number;
};

export type CorrectiveReadFilters = CommonFilters & {
  unitId?: number;
  priority?: (typeof CORRECTIVE_PRIORITIES)[number];
  categoryId?: number;
  subcategoryId?: number;
};

export type PreventiveReadFilters = CommonFilters & {
  assetId?: number;
  planId?: number;
  dueFrom?: string;
  dueTo?: string;
};

export type MaintenanceReadFilters =
  | CorrectiveReadFilters
  | PreventiveReadFilters;

type BaseItem = {
  id: number;
  number: string | null;
  title: string | null;
  /** Nombre estable del estado, independiente del idioma de la sesión. */
  status: string | null;
  statusLabel: string | null;
  isClosed: boolean;
  building: MaintenanceRef | null;
  assignee: MaintenanceRef | null;
  team: MaintenanceRef | null;
  openingDate: string | null;
  plannedStartTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  warnings: MaintenanceWarning[];
};

export type CorrectiveReadItem = BaseItem & {
  kind: 'corrective';
  priority: { code: string; label: string } | null;
  category: { id: number; name: string } | null;
  subcategory: { id: number; name: string; isOther: boolean } | null;
  floor: MaintenanceRef | null;
  unit: MaintenanceRef | null;
  commonArea: MaintenanceRef | null;
  asset: MaintenanceRef | null;
  closureDate: string | null;
  isPendingReview: boolean;
};

export type PreventiveReadItem = BaseItem & {
  kind: 'preventive';
  asset: MaintenanceRef | null;
  plan: MaintenanceRef | null;
  dueDate: string | null;
  isOverdue: boolean;
  suspensionReason: string | null;
};

export type MaintenanceReadItem = CorrectiveReadItem | PreventiveReadItem;

export type MaintenanceReadAttachment = {
  id: string;
  fileName: string | null;
  description: string | null;
  category: string | null;
  uploadDate: string | null;
  downloadUrl: string;
};

export type MaintenanceChecklistItem = {
  order: number;
  label: string;
  kind: string;
  value: string | number | null;
  isResolved: boolean;
  equipment: string | null;
};

export type MaintenanceChecklist = {
  total: number;
  resolved: number;
  items: MaintenanceChecklistItem[];
};

type DetailExtras = {
  log: RegisterLogEntry[];
  attachments: MaintenanceReadAttachment[];
};

export type CorrectiveReadDetail = CorrectiveReadItem &
  DetailExtras & {
    reportNotes: string | null;
    cancelReason: string | null;
  };

export type PreventiveReadDetail = PreventiveReadItem &
  DetailExtras & {
    checklist: MaintenanceChecklist | null;
  };

export type MaintenanceReadDetail = CorrectiveReadDetail | PreventiveReadDetail;

export type MaintenanceReadFile = {
  data: Buffer;
  contentType: string;
  fileName: string | null;
};

export type MaintenanceOrderRef = { kind: MaintenanceKind; id: number };

/** Orden abierta de un técnico, lo justo para ubicarla en la agenda. */
export type TechnicianOrder = {
  id: number;
  number: string | null;
  title: string | null;
  status: string | null;
  building: MaintenanceRef | null;
  plannedStartTime: string | null;
  actualStartTime: string | null;
};

export type MaintenanceTechnician = {
  id: number;
  name: string;
  team: MaintenanceRef | null;
  isSupplier: boolean;
  inExecution: MaintenanceOrderRef[];
  correctives: TechnicianOrder[];
  preventives: TechnicianOrder[];
  /** Abiertas sin fecha prevista. */
  unscheduled: (TechnicianOrder & { kind: MaintenanceKind })[];
};

export type MaintenanceCategory = {
  id: number;
  code: string;
  name: string;
  subcategories: { id: number; name: string; isOther: boolean }[];
};

export interface MaintenanceReadContract {
  list(
    kind: MaintenanceKind,
    filters: MaintenanceReadFilters,
  ): Promise<{ items: MaintenanceReadItem[]; total: number | null }>;
  detail(kind: MaintenanceKind, id: number): Promise<MaintenanceReadDetail>;
  attachment(
    kind: MaintenanceKind,
    id: number,
    attachmentId: string,
  ): Promise<MaintenanceReadFile>;
  technicians(range: {
    from: string;
    to: string;
  }): Promise<MaintenanceTechnician[]>;
  categories(): Promise<MaintenanceCategory[]>;
}
