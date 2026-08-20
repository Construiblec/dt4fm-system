/**
 * Prioridad de un mantenimiento, en un solo sitio.
 *
 * Antes había tres definiciones sueltas y ninguna en `constants/`:
 * `TaskCard.tsx` (texto y borde), `IncidentDetailPage.tsx` (tinte 50 + ring) y
 * `ReportIncidentPage.tsx` (botones del formulario). Ninguna cubría `Crítico`,
 * que existe en openMAINT y caía al gris de «desconocido».
 *
 * El género también estaba mezclado: el formulario decía «Alta/Media/Baja» y la
 * tarjeta «Alto/Medio/Bajo». Se unifica en masculino, que es lo que devuelve
 * openMAINT en `_Priority_description_translation`.
 */
export type PriorityCode = "Critical" | "High" | "Medium" | "Low";

/**
 * IDs del lookup `COMMON - Priority`. Son la fuente estable: la descripción
 * viaja traducida según el idioma de la sesión y no sirve de identificador.
 */
export const PRIORITY_IDS: Record<PriorityCode, number> = {
  Critical: 117,
  High: 118,
  Medium: 119,
  Low: 120,
};

export const PRIORITY_LABELS: Record<PriorityCode, string> = {
  Critical: "Crítico",
  High: "Alto",
  Medium: "Medio",
  Low: "Bajo",
};

/** De más urgente a menos, que es como se espera leerlo en un filtro. */
export const PRIORITY_ORDER: PriorityCode[] = [
  "Critical",
  "High",
  "Medium",
  "Low",
];

/** Distintivo dentro de la tarjeta, junto al estado. */
export const PRIORITY_BADGE_CLASSES: Record<PriorityCode, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-emerald-100 text-emerald-700",
};

/** Versión con anillo, para las cabeceras de detalle. */
export const PRIORITY_PILL_CLASSES: Record<PriorityCode, string> = {
  Critical: "bg-red-50 text-red-700 ring-red-200",
  High: "bg-orange-50 text-orange-700 ring-orange-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  Low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

/**
 * Acepta el código estable del backend y también las etiquetas en castellano,
 * porque el correctivo antiguo (`/incidents/my`) todavía devuelve el texto ya
 * traducido en vez de un código.
 */
export const toPriorityCode = (
  value: string | null | undefined,
): PriorityCode | null => {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();

  const byCode = PRIORITY_ORDER.find(
    (code) => code.toLowerCase() === normalized,
  );
  if (byCode) return byCode;

  const byLabel = PRIORITY_ORDER.find(
    (code) => PRIORITY_LABELS[code].toLowerCase() === normalized,
  );
  if (byLabel) return byLabel;

  // El formulario histórico usaba el femenino; openMAINT en inglés, «High».
  const aliases: Record<string, PriorityCode> = {
    critica: "Critical",
    crítica: "Critical",
    alta: "High",
    media: "Medium",
    baja: "Low",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  return aliases[normalized] ?? null;
};

export const getPriorityLabel = (code: PriorityCode | null): string =>
  code ? PRIORITY_LABELS[code] : "Sin prioridad";
