export type Incident = {
  id: number;
  number: string;
  location: string;
  priority: string;
  /**
   * Código estable del estado (`Execution`, `Assignment`, …). Es el que debe
   * gobernar la lógica: `status` viaja traducido según el idioma de la sesión.
   */
  statusCode: string | null;
  /** Etiqueta ya traducida por OpenMAINT; solo para mostrar. */
  status: string;
  building: string;
  createdAt: string;
  /** `ExpExecStartDate`: cuándo se planificó empezar. */
  plannedStart: string | null;
};
