/**
 * Paleta única de estados, compartida por limpieza y mantenimiento.
 *
 * Está organizada por **significado**, no por dominio, que es lo que permite
 * que un mismo concepto se vea igual en los dos módulos. Antes de esto había
 * once mapas sueltos y el mismo estado salía de colores distintos: «asignado»
 * era ámbar en mantenimiento y azul en limpieza, y «en ejecución» justo al
 * revés — el usuario veía en una pestaña «azul = trabajando» y en la otra
 * «azul = todavía sin empezar».
 *
 * Para añadir un estado nuevo, mapéalo a uno de estos niveles desde el archivo
 * de su dominio (`preventiveStatus.ts`, `correctiveStatus.ts`,
 * `cleaningPhase.ts`). No declares clases de color fuera de aquí.
 */
export type StatusLevel =
  | "pending"
  | "assigned"
  | "inProgress"
  | "paused"
  | "review"
  | "done"
  | "cancelled"
  | "admin";

type LevelStyle = {
  /** Distintivo en tarjetas de lista */
  badge: string;
  /** Distintivo en cabeceras de detalle (más redondeado y con más aire) */
  pill: string;
  /** Borde izquierdo de la tarjeta */
  border: string;
};

export const STATUS_LEVELS: Record<StatusLevel, LevelStyle> = {
  /** Sin despachar todavía */
  pending: {
    badge: "bg-slate-100 text-slate-700",
    pill: "bg-slate-100 text-slate-700",
    border: "border-slate-400",
  },
  /** Tiene responsable pero nadie ha arrancado */
  assigned: {
    badge: "bg-amber-100 text-amber-700",
    pill: "bg-amber-100 text-amber-700",
    border: "border-amber-500",
  },
  /** Alguien está trabajando en ello ahora */
  inProgress: {
    badge: "bg-blue-100 text-blue-700",
    pill: "bg-blue-100 text-blue-700",
    border: "border-blue-500",
  },
  /** Detenido temporalmente, se retomará */
  paused: {
    badge: "bg-violet-100 text-violet-700",
    pill: "bg-violet-100 text-violet-700",
    border: "border-violet-500",
  },
  /**
   * Trabajo hecho, esperando el visto bueno del supervisor. Es el nivel que
   * unifica los dos dominios: la fase `Completed` de limpieza y el estado
   * `Accounting` del correctivo significan exactamente esto, y hasta ahora se
   * pintaban de gris y de violeta respectivamente, sin ninguna relación.
   */
  review: {
    badge: "bg-indigo-100 text-indigo-700",
    pill: "bg-indigo-100 text-indigo-700",
    border: "border-indigo-500",
  },
  /** Cerrado y conforme */
  done: {
    badge: "bg-emerald-100 text-emerald-700",
    pill: "bg-emerald-100 text-emerald-700",
    border: "border-emerald-500",
  },
  /** Cerrado sin ejecutarse */
  cancelled: {
    badge: "bg-red-100 text-red-700",
    pill: "bg-red-100 text-red-700",
    // Antes era `border-slate-300`: badge rojo y borde gris para lo mismo.
    border: "border-red-400",
  },
  /** Trámite administrativo (presupuesto, contabilidad, control, gestión) */
  admin: {
    badge: "bg-cyan-100 text-cyan-700",
    pill: "bg-cyan-100 text-cyan-700",
    border: "border-cyan-500",
  },
};

/** Cuando el código de estado no está mapeado, para no romper la vista. */
export const UNKNOWN_STATUS: LevelStyle = STATUS_LEVELS.pending;

/**
 * Fuera de plazo. No es un estado sino un distintivo que se suma al que haya,
 * así que vive aparte. Antes había tres paletas para esto: naranja en limpieza,
 * rojo en preventivo y ámbar en el indicador global.
 */
export const OVERDUE_STYLE = {
  badge: "bg-red-100 text-red-700",
  border: "border-red-500",
} as const;

/** Geometría del distintivo, para que no haya cuatro formas distintas. */
export const BADGE_SHAPE = "rounded-md px-2 py-1 text-xs font-semibold";
export const PILL_SHAPE = "rounded-full px-3 py-1 text-xs font-semibold";

export const badgeClass = (level: StatusLevel | undefined) =>
  `${BADGE_SHAPE} ${(level ? STATUS_LEVELS[level] : UNKNOWN_STATUS).badge}`;

export const pillClass = (level: StatusLevel | undefined) =>
  `${PILL_SHAPE} ${(level ? STATUS_LEVELS[level] : UNKNOWN_STATUS).pill}`;

export const borderClass = (level: StatusLevel | undefined) =>
  (level ? STATUS_LEVELS[level] : UNKNOWN_STATUS).border;
