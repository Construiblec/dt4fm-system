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
export const PREVENTIVE_ACTIVE_STATUSES = ["Acceptance", "Execution"] as const;

export const getPreventiveStatusLabel = (
  statusCode: string | null,
  fallback: string | null,
) => PREVENTIVE_STATUS_LABELS[statusCode ?? ""] ?? fallback ?? "Sin estado";
