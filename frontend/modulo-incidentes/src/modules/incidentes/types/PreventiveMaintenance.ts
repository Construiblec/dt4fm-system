import type { PreventiveChecklistItem } from "@/modules/incidentes/types/PreventiveChecklist";

/** Identificadores estables de estado que devuelve el backend. */
export type PreventiveMaintenanceStatusCode =
  | "Planning"
  | "Acceptance"
  | "Execution"
  | "Suspension"
  | "Completed"
  | "Canceled";

export type PreventiveMaintenance = {
  id: number;
  number: string | null;
  subject: string | null;
  /** Identificador estable del estado, independiente del idioma */
  statusCode: string | null;
  /** Etiqueta del estado ya traducida por OpenMAINT */
  status: string | null;
  isClosed: boolean;
  isOverdue: boolean;
  site: string | null;
  /** Equipo/activo intervenido */
  equipment: string | null;
  /** Plan preventivo del que se generó */
  plan: string | null;
  team: string | null;
  assignee: string | null;
  openingDate: string | null;
  expectedStartDate: string | null;
  dueDate: string | null;
  execStartDate: string | null;
  execEndDate: string | null;
};

export type PreventiveMaintenanceDetail = PreventiveMaintenance & {
  notes: string | null;
  images: string[];
  /** El mantenimiento está en ejecución y puede cerrarse */
  canComplete: boolean;
  /** Puede suspenderse; a diferencia del cierre no exige el checklist completo */
  canSuspend: boolean;
  /** Motivo con el que se suspendió, si lo está */
  suspensionReason: string | null;
  /** Actividades a ejecutar; el cierre exige tenerlas todas resueltas */
  checklist: PreventiveChecklistItem[];
};

/** Mantenimiento ya cerrado sobre el mismo equipo. */
export type PreventiveMaintenanceHistoryEntry = PreventiveMaintenance & {
  /** Cuántos archivos dejó; alimenta la etiqueta «Informe generado» */
  attachmentCount: number;
};

export type PreventiveMaintenanceAttachment = {
  id: string;
  fileName: string;
  category: string | null;
  /** Descripción que se escribió al subirlo */
  description: string | null;
  uploadDate: string | null;
  /** Ruta del backend, hay que componerla con el token para abrirla */
  downloadUrl: string;
  isImage: boolean;
};

/** Opción del desplegable de motivo de suspensión. */
export type SuspensionReason = {
  id: string;
  label: string;
};
