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
 * contabilidad, control y gestión). El técnico solo veía «Ejecución» y
 * comparaba contra el texto en castellano; aquí se usa el `statusCode` estable
 * que devuelve el backend.
 *
 * `Assigned` **no existe en openMAINT**: asignar avanza CM02 directo a
 * Ejecución, así que el backend lo deriva mientras no haya un inicio real.
 */
export const CORRECTIVE_STATUS_LABELS: Record<string, string> = {
  Opening: "Apertura",
  Assignment: "Asignación",
  Assigned: "Asignado",
  Estimate: "Presupuesto",
  Control: "Control",
  Execution: "Ejecución",
  Accounting: "Contabilidad",
  Management: "Gestión",
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
 * El listado antiguo (`GET /incidents/my`) devuelve la etiqueta ya traducida en
 * vez del código estable. Esto la reduce al código para poder pintarla igual
 * que todo lo demás, hasta que ese endpoint se alinee con el resto.
 */
export const toCorrectiveStatusCode = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();

  const byCode = Object.keys(CORRECTIVE_STATUS_LABELS).find(
    (code) => code.toLowerCase() === normalized,
  );
  if (byCode) return byCode;

  const byLabel = Object.entries(CORRECTIVE_STATUS_LABELS).find(
    ([, label]) => label.toLowerCase() === normalized,
  );

  return byLabel ? byLabel[0] : null;
};
