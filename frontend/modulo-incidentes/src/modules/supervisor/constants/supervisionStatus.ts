import {
  STATUS_LEVELS,
  UNKNOWN_STATUS,
  type StatusLevel,
} from "@/shared/constants/statusPalette";
import type { SupervisionPhase } from "@/modules/supervisor/types/Supervision";

/**
 * Fase de la supervisión → nivel de la paleta compartida. Sin colores
 * propios: «En corrección» se ve como cualquier trabajo asignado sin cerrar.
 *
 * Las etiquetas son de la PWA y no las de openMAINT, que tienen erratas
 * («Aprovado») que esta revisión no corrige allí.
 */
const PHASES: Record<SupervisionPhase, { label: string; level: StatusLevel }> =
  {
    Draft: { label: "Borrador", level: "pending" },
    InCorrection: { label: "En corrección", level: "assigned" },
    Fixed: { label: "Corregida", level: "review" },
    Confirmed: { label: "Confirmada", level: "inProgress" },
    Approved: { label: "Aprobada", level: "done" },
    Cancelled: { label: "Anulada", level: "discarded" },
  };

export const getSupervisionPhaseLabel = (
  phase: SupervisionPhase | null | undefined,
) => (phase ? (PHASES[phase]?.label ?? phase) : "Sin supervisión");

export const getSupervisionPhasePill = (
  phase: SupervisionPhase | null | undefined,
) => (phase && PHASES[phase] ? STATUS_LEVELS[PHASES[phase].level] : UNKNOWN_STATUS)
  .pill;

/** Fases en que la supervisión sigue abierta (ni aprobada ni anulada). */
export const isOpenSupervision = (phase: SupervisionPhase | null | undefined) =>
  phase === "Draft" ||
  phase === "InCorrection" ||
  phase === "Fixed" ||
  phase === "Confirmed";

export const unavailableMessage: Record<string, string> = {
  legacy:
    "Esta limpieza terminó antes de que empezara la supervisión, así que no se supervisa.",
  superseded:
    "La unidad ya tiene una limpieza más reciente: supervisa esa en su lugar.",
  disabled:
    "La supervisión de limpiezas ya terminadas no está habilitada en este ambiente.",
  reviewed: "Esta limpieza ya fue revisada.",
};
