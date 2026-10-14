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
  createdAt: string;
  /** Lo que escribió quien reportó la novedad. */
  reportNotes: string | null;
  /** La nota del último paso del flujo. */
  notes: string | null;
  /** Notas posteriores a la apertura, en orden cronológico. */
  log?: LogEntry[];
  images: string[];
};
