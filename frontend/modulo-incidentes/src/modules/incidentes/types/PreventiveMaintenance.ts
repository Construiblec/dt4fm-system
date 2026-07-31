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
  /** Actividades a ejecutar; el cierre exige tenerlas todas resueltas */
  checklist: PreventiveChecklistItem[];
};
