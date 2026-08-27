import {
  badgeClass,
  borderClass,
  pillClass,
  type StatusLevel,
} from "@/shared/constants/statusPalette";

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

/** Estado → nivel de la paleta compartida. Los colores viven allí, no aquí. */
export const PREVENTIVE_STATUS_LEVELS: Record<string, StatusLevel> = {
  Planning: "pending",
  Acceptance: "assigned",
  Execution: "inProgress",
  Suspension: "paused",
  Completed: "done",
  Canceled: "cancelled",
};

export const getPreventiveStatusLevel = (
  statusCode: string | null,
): StatusLevel | undefined => PREVENTIVE_STATUS_LEVELS[statusCode ?? ""];

/** Distintivo de estado, compartido por la tarjeta del dashboard y el detalle. */
export const getPreventiveStatusBadge = (statusCode: string | null) =>
  badgeClass(getPreventiveStatusLevel(statusCode));

export const getPreventiveStatusPill = (statusCode: string | null) =>
  pillClass(getPreventiveStatusLevel(statusCode));

/** Borde izquierdo de la tarjeta del dashboard. */
export const getPreventiveStatusBorder = (statusCode: string | null) =>
  borderClass(getPreventiveStatusLevel(statusCode));

export const getPreventiveStatusLabel = (
  statusCode: string | null,
  fallback: string | null,
) => PREVENTIVE_STATUS_LABELS[statusCode ?? ""] ?? fallback ?? "Sin estado";
