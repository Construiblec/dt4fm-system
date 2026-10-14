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
  /** Breve descripción; `location` es el mismo dato con su nombre antiguo. */
  subject?: string | null;
  /** Código estable (`Critical|High|Medium|Low`) */
  priorityCode?: string | null;
  execStartDate?: string | null;
  execEndDate?: string | null;
  floor?: string | null;
  /** Unidad o área común */
  area?: string | null;
};
