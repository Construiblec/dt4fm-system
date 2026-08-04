/**
 * Etiquetas de los estados del flujo preventivo.
 *
 * OpenMAINT llama "Aceptación" al paso PM02, pero en la app se muestra como
 * "Asignación" para que coincida con el vocabulario del mantenimiento
 * correctivo, donde un trabajo recién asignado aparece igual.
 */
export const PREVENTIVE_STATUS_LABELS: Record<string, string> = {
  Planning: "Planificación",
  Acceptance: "Asignación",
  Execution: "Ejecución",
  Suspension: "Suspensión",
  Completed: "Completado",
  Canceled: "Cancelado",
};

/** Estados que el técnico puede tener pendientes en su dashboard. */
export const PREVENTIVE_ACTIVE_STATUSES = [
  "Acceptance",
  "Execution",
  "Suspension",
] as const;

/** Distintivo de estado, compartido por la tarjeta del dashboard y el detalle. */
export const PREVENTIVE_STATUS_BADGE_CLASSES: Record<string, string> = {
  Planning: "bg-slate-100 text-slate-700",
  Acceptance: "bg-amber-100 text-amber-700",
  Execution: "bg-blue-100 text-blue-700",
  Suspension: "bg-violet-100 text-violet-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Canceled: "bg-red-100 text-red-700",
};

/** Borde izquierdo de la tarjeta del dashboard. */
export const PREVENTIVE_STATUS_BORDER_CLASSES: Record<string, string> = {
  Planning: "border-slate-400",
  Acceptance: "border-amber-500",
  Execution: "border-blue-500",
  Suspension: "border-violet-500",
  Completed: "border-emerald-500",
  Canceled: "border-slate-300",
};

export const getPreventiveStatusLabel = (
  statusCode: string | null,
  fallback: string | null,
) => PREVENTIVE_STATUS_LABELS[statusCode ?? ""] ?? fallback ?? "Sin estado";
