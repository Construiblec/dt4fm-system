export type IncidentDetail = {
  id: number;
  number: string;
  location: string;
  building: string;
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
  images: string[];
};
