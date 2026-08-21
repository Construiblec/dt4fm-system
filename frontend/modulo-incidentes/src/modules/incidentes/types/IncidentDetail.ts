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
  notes: string | null;
  images: string[];
};
