/** Tipo de mantenimiento; también es el segmento de ruta y del endpoint. */
export type MaintenanceKind = "corrective" | "preventive";

export type MaintenanceRef = {
  id: number;
  name: string;
};

/** Contrato común que devuelve `/maintenance-supervision`. */
export type SupervisedMaintenance = {
  id: number;
  kind: MaintenanceKind;
  number: string | null;
  subject: string | null;
  /** Identificador estable del estado, independiente del idioma */
  statusCode: string | null;
  /** Etiqueta ya traducida por openMAINT */
  status: string | null;
  isClosed: boolean;
  site: string | null;
  assignee: MaintenanceRef | null;
  team: MaintenanceRef | null;
  /** Código estable (`Critical|High|Medium|Low`). Los preventivos no la traen */
  priority: { code: string; label: string } | null;
  openingDate: string | null;
  /** `ExpExecStartDate`: cuándo se planificó empezar */
  plannedStart: string | null;
  /** `DueExecEndDate`. Solo lo traen los preventivos */
  dueDate: string | null;
  /** Sigue abierto y ya pasó su fecha límite */
  isOverdue: boolean;
  execStartDate: string | null;
  execEndDate: string | null;
};

export type Assignee = {
  id: number;
  name: string;
  team: MaintenanceRef | null;
  /** Un proveedor pertenece a un solo equipo: sus trabajos no se reasignan */
  isSupplier: boolean;
};

export type ListParams = {
  status?: string;
  assigned?: boolean;
  limit?: number;
  offset?: number;
};

export type ListResponse = {
  success: boolean;
  data: SupervisedMaintenance[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    /** Cuántos esperan revisión; `null` en preventivo, que no tiene ese paso */
    pendingReview: number | null;
  };
};

export type AssigneesResponse = {
  success: boolean;
  data: Assignee[];
  meta: { total: number };
};

export type MaintenanceResponse = {
  success: boolean;
  data: SupervisedMaintenance;
};

export type AssignPayload = {
  assigneeId: number;
  /** Se ignora en preventivo: `Team` no es escribible en su flujo */
  teamId?: number;
  plannedStart?: string;
  notes?: string;
};
