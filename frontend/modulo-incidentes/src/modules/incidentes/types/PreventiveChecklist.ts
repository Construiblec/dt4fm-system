/** Clase de campo con la que se resuelve cada actividad del checklist. */
export type ChecklistFieldKind =
  | "date"
  | "time"
  | "number"
  | "lookup"
  | "posneg"
  | "text"
  | "flag"
  | "datetime";

export type ChecklistOption = {
  id: string;
  label: string;
};

export type PreventiveChecklistItem = {
  order: number;
  /** Clave estable con la que se envía la respuesta al backend */
  taskDefId: number;
  label: string;
  kind: ChecklistFieldKind;
  value: string | number | null;
  isResolved: boolean;
  /** Equipo concreto sobre el que se ejecuta la actividad */
  equipment: string | null;
  /** Solo en los tipos con desplegable */
  options?: ChecklistOption[];
};

export type ChecklistAnswer = {
  taskDefId: number;
  value: string;
};
