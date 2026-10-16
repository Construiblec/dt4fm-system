/**
 * Cómo ve su reporte quien lo abrió: cuatro pasos en lenguaje llano en vez de
 * los nueve estados del flujo correctivo (ver `correctiveStatus.ts`).
 */
export type ReporterTone =
  "received" | "assigned" | "inProgress" | "done" | "discarded";

export type ReporterStep = {
  label: string;
  /** 0–3 dentro de Recibido → Resuelto; -1 si se descartó. */
  step: number;
  tone: ReporterTone;
  /** Frase corta de lo que está pasando. */
  phrase: string;
};

export const REPORTER_STEPS = [
  "Recibido",
  "Asignado",
  "En atención",
  "Resuelto",
] as const;

const RECEIVED: ReporterStep = {
  label: "Recibido",
  step: 0,
  tone: "received",
  phrase: "Esperando asignación",
};

const BY_STATUS: Record<string, ReporterStep> = {
  Opening: RECEIVED,
  Assignment: RECEIVED,
  Management: RECEIVED,
  Estimate: RECEIVED,
  Assigned: {
    label: "Asignado",
    step: 1,
    tone: "assigned",
    phrase: "Un técnico tomó tu caso",
  },
  Execution: {
    label: "En atención",
    step: 2,
    tone: "inProgress",
    phrase: "El técnico está trabajando en el sitio",
  },
  // Terminado pero sin aprobar: si se rechaza vuelve a ejecución, así que no se anuncia «Resuelto».
  Accounting: {
    label: "En atención",
    step: 2,
    tone: "inProgress",
    phrase: "Trabajo terminado, en revisión",
  },
  Control: {
    label: "En atención",
    step: 2,
    tone: "inProgress",
    phrase: "Trabajo terminado, en revisión",
  },
  Completed: {
    label: "Resuelto",
    step: 3,
    tone: "done",
    phrase: "Trabajo terminado y aprobado",
  },
  Canceled: {
    label: "Descartado",
    step: -1,
    tone: "discarded",
    phrase: "No procede",
  },
};

export const toReporterStep = (
  statusCode: string | null | undefined,
): ReporterStep => (statusCode && BY_STATUS[statusCode]) || RECEIVED;

export const isOpenReport = (statusCode: string | null | undefined) =>
  !["Completed", "Canceled"].includes(statusCode ?? "");

type ToneStyle = {
  chip: string;
  /** Color de trazo del anillo y de la línea de seguimiento. */
  stroke: string;
  text: string;
  dot: string;
};

// Mismos tonos que `statusPalette`: recibido neutro, asignado ámbar, en curso azul.
export const REPORTER_TONES: Record<ReporterTone, ToneStyle> = {
  received: {
    chip: "bg-slate-100 text-slate-600",
    stroke: "#64748b",
    text: "text-slate-600",
    dot: "bg-slate-500",
  },
  assigned: {
    chip: "bg-amber-100 text-amber-800",
    stroke: "#f59e0b",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  inProgress: {
    chip: "bg-blue-100 text-blue-700",
    stroke: "#2563eb",
    text: "text-blue-700",
    dot: "bg-blue-600",
  },
  done: {
    chip: "bg-emerald-100 text-emerald-700",
    stroke: "#10b981",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  discarded: {
    chip: "bg-rose-100 text-rose-700",
    stroke: "#e11d48",
    text: "text-rose-700",
    dot: "bg-rose-600",
  },
};
