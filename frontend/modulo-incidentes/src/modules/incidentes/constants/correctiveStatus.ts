import {
  badgeClass,
  borderClass,
  pillClass,
  type StatusLevel,
} from "@/shared/constants/statusPalette";

/**
 * Etiquetas y niveles de los estados del flujo correctivo, hermano de
 * `preventiveStatus.ts`.
 *
 * El flujo tiene nueve estados, cuatro de ellos administrativos (presupuesto,
 * contabilidad, control y administración). Todas las vistas usan el `statusCode`
 * estable que devuelve el backend; estas etiquetas son solo para mostrar.
 *
 * `Assigned` **no existe en openMAINT**: asignar avanza CM02 directo a
 * Ejecución, así que el backend vacía `ExecStartDate` y lo deriva mientras no
 * haya un inicio real.
 */
export const CORRECTIVE_STATUS_LABELS: Record<string, string> = {
  Opening: "Apertura",
  Assignment: "Asignación",
  Assigned: "Asignado",
  Estimate: "Presupuesto",
  Control: "Control",
  Execution: "Ejecución",
  Accounting: "Contabilidad",
  // OpenMAINT rotula este paso «Administración»; se respeta para que coincida
  // con lo que se ve en su propia interfaz.
  Management: "Administración",
  Completed: "Completado",
  Canceled: "Cancelado",
};

/** Orden en que se ofrecen en el filtro; sigue el recorrido real del flujo. */
export const CORRECTIVE_STATUS_ORDER = [
  "Opening",
  "Assignment",
  "Assigned",
  "Execution",
  "Estimate",
  "Control",
  "Accounting",
  "Management",
  "Completed",
  "Canceled",
] as const;

/**
 * Estados que se pueden mandar al backend como filtro. `Assigned` queda fuera:
 * es derivado y openMAINT no sabe filtrar por él.
 */
export const CORRECTIVE_FILTERABLE_STATUSES = CORRECTIVE_STATUS_ORDER.filter(
  (status) => status !== "Assigned",
);

/**
 * Estado → nivel de la paleta compartida.
 *
 * `Accounting` es `review` y no un color propio: significa lo mismo que la fase
 * `Completed` de limpieza — hecho, pendiente del visto bueno del supervisor.
 */
export const CORRECTIVE_STATUS_LEVELS: Record<string, StatusLevel> = {
  Opening: "pending",
  Assignment: "assigned",
  Assigned: "assigned",
  Execution: "inProgress",
  Estimate: "admin",
  Control: "admin",
  Management: "admin",
  Accounting: "review",
  Completed: "done",
  Canceled: "cancelled",
};

export const getCorrectiveStatusLevel = (
  statusCode: string | null,
): StatusLevel | undefined => CORRECTIVE_STATUS_LEVELS[statusCode ?? ""];

export const getCorrectiveStatusBadge = (statusCode: string | null) =>
  badgeClass(getCorrectiveStatusLevel(statusCode));

export const getCorrectiveStatusPill = (statusCode: string | null) =>
  pillClass(getCorrectiveStatusLevel(statusCode));

export const getCorrectiveStatusBorder = (statusCode: string | null) =>
  borderClass(getCorrectiveStatusLevel(statusCode));

export const getCorrectiveStatusLabel = (
  statusCode: string | null,
  fallback: string | null,
) => CORRECTIVE_STATUS_LABELS[statusCode ?? ""] ?? fallback ?? "Sin estado";

/** El correctivo espera revisión del supervisor en el paso de contabilidad. */
export const CORRECTIVE_PENDING_REVIEW_STATUS = "Accounting";

/**
 * Por qué el técnico no puede abrir un correctivo, o `null` si sí puede.
 *
 * El motivo depende del estado: decir «aún no está en ejecución» en un trabajo
 * ya completado o pendiente de revisión confunde, porque esos pasos van
 * *después* de la ejecución, no antes. Los textos son cortos a propósito: la
 * tarjeta los recorta si no caben.
 *
 * `Assigned` sí se abre: es trabajo ya despachado al técnico, solo que todavía
 * sin arrancar. Bloquearlo lo dejaría sin manera de empezarlo.
 */
export const getCorrectiveBlockedReason = (
  statusCode: string | null,
): string | null => {
  switch (statusCode) {
    case "Assigned":
    case "Execution":
      return null;
    case "Opening":
    case "Assignment":
      return "Aún no está en ejecución";
    case "Accounting":
      return "Pendiente de revisión";
    case "Estimate":
    case "Control":
    case "Management":
      return "En gestión administrativa";
    case "Completed":
      return "Trabajo completado";
    case "Canceled":
      return "Trabajo cancelado";
    default:
      return "No disponible";
  }
};
