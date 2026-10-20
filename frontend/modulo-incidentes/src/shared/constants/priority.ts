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

/** Punto de la píldora de la tarjeta; tonos que no se confunden con los estados. */
export const PRIORITY_DOT_CLASSES: Record<PriorityCode, string> = {
  Critical: "bg-red-900",
  High: "bg-red-600",
  Medium: "bg-amber-600",
  Low: "bg-emerald-500",
};

/** En femenino, para concordar con «prioridad»: «Alta», «Prioridad alta». */
export const PRIORITY_ADJECTIVES: Record<PriorityCode, string> = {
  Critical: "Crítica",
  High: "Alta",
  Medium: "Media",
  Low: "Baja",
};

export const PRIORITY_PHRASES = Object.fromEntries(
  PRIORITY_ORDER.map((code) => [
    code,
    `Prioridad ${PRIORITY_ADJECTIVES[code].toLowerCase()}`,
  ]),
) as Record<PriorityCode, string>;

/** Versión con anillo, para las cabeceras de detalle. */
export const PRIORITY_PILL_CLASSES: Record<PriorityCode, string> = {
  Critical: "bg-red-50 text-red-700 ring-red-200",
  High: "bg-orange-50 text-orange-700 ring-orange-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
  Low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

/** Criterio acordado para elegir la criticidad de un correctivo (1 = Crítica … 4 = Baja). */
export const PRIORITY_GUIDE: Record<
  PriorityCode,
  { level: number; sla: string; action: string; examples: string }
> = {
  Critical: {
    level: 1,
    sla: "15 min a 2 h",
    action:
      "Atención inmediata. Se interrumpe cualquier tarea en curso para mitigar el riesgo.",
    examples:
      "Fuga de gas, inundación por tubería rota, fallo eléctrico total en unidad ocupada.",
  },
  High: {
    level: 2,
    sla: "2 a 8 h",
    action: "Se atiende en el mismo turno de trabajo.",
    examples:
      "Falta de agua caliente en la suite, aire acondicionado o calefón fuera de servicio.",
  },
  Medium: {
    level: 3,
    sla: "24 a 48 h",
    action:
      "Se programa dentro de las siguientes 24 horas o en el cambio de turno.",
    examples:
      "Sensor de luz dañado en pasillo, goteo menor en lavamanos, tomacorriente averiado.",
  },
  Low: {
    level: 4,
    sla: "2 a 7 días",
    action: "Entra en la cola del plan de mantenimiento semanal.",
    examples:
      "Retoque de pintura en zócalos, ajuste de bisagra de armario, cambio de filtro programado.",
  },
};

/** Recuadro de guía y filas de la hoja «¿Cómo elegir la prioridad?». */
export const PRIORITY_GUIDE_CLASSES: Record<
  PriorityCode,
  { box: string; border: string; title: string }
> = {
  Critical: {
    box: "border-red-200 bg-red-50",
    border: "border-red-200",
    title: "text-red-800",
  },
  High: {
    box: "border-orange-200 bg-orange-50",
    border: "border-orange-200",
    title: "text-orange-800",
  },
  Medium: {
    box: "border-amber-200 bg-amber-50",
    border: "border-amber-200",
    title: "text-amber-800",
  },
  Low: {
    box: "border-emerald-200 bg-emerald-50",
    border: "border-emerald-200",
    title: "text-emerald-800",
  },
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
