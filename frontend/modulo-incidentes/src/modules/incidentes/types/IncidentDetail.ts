import type { ReporterKind } from "@/shared/components/CorrectiveCard";
import type { LogEntry } from "@/shared/components/NotesLogCard";

export type IncidentDetail = {
  id: number;
  number: string;
  /** Breve descripción (ShortDescr); en correctivos antiguos, planta y área */
  location: string;
  building: string;
  floor?: string | null;
  unit?: string | null;
  commonArea?: string | null;
  /**
   * Código estable del estado (`Execution`, `Assignment`, …). Es el que debe
   * gobernar la lógica; `status` es solo la etiqueta que devuelve OpenMAINT.
   */
  statusCode: string | null;
  status: string;
  priority: string;
  /** `Critical|High|Medium|Low`, o null si aún no se fijó */
  priorityCode?: string | null;
  createdAt: string;
  plannedStart?: string | null;
  execStartDate?: string | null;
  execEndDate?: string | null;
  reporter?: { name: string; kind: ReporterKind } | null;
  requesterName?: string | null;
  assigneeName?: string | null;
  category?: { id: number; name: string } | null;
  /** También es el título (`location`), salvo con «Otro». */
  subcategory?: { id: number; name: string; isOther: boolean } | null;
  /** Equipo intervenido */
  asset?: string | null;
  assetId?: number | null;
  /** Lo que escribió quien reportó la novedad. */
  reportNotes: string | null;
  /** La nota del último paso del flujo. */
  notes: string | null;
  /** Notas posteriores a la apertura, en orden cronológico. */
  log?: LogEntry[];
  images: string[];
};
