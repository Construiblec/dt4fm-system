import {
  badgeClass,
  borderClass,
  pillClass,
  type StatusLevel,
} from "@/shared/constants/statusPalette";

/**
 * Fases de una tarea de limpieza, en un solo sitio.
 *
 * Recoge tres mapas que estaban duplicados —`CleaningTaskCard`,
 * `SupervisorTaskCard` y `TaskDetailInfo`— y que además no coincidían entre sí:
 * la misma fase `Completed` salía gris para el operario y violeta para el
 * supervisor.
 *
 * Se descarta la clave `InProgress` que había en `CleaningTaskCard`: no existe
 * en el backend (`phase.constants.ts` define `InExecution`) ni en ningún otro
 * mapa. Era código muerto.
 */
export const CLEANING_PHASE_LABELS: Record<string, string> = {
  Assigned: "Asignada",
  InExecution: "En ejecución",
  Completed: "Completada",
  Reviewed: "Revisada",
  Cancelled: "Cancelada",
};

/**
 * Fase → nivel de la paleta compartida.
 *
 * Ojo con `Completed`: en limpieza **no** significa «cerrado», sino «el
 * operario terminó y falta que el supervisor lo revise». Por eso es `review` y
 * no `done`; el cierre real es `Reviewed`. Es el mismo significado que el
 * estado `Accounting` del correctivo, y ahora comparten color.
 */
export const CLEANING_PHASE_LEVELS: Record<string, StatusLevel> = {
  Assigned: "assigned",
  InExecution: "inProgress",
  Completed: "review",
  Reviewed: "done",
  Cancelled: "cancelled",
};

export const getCleaningPhaseLevel = (
  phase: string | null | undefined,
): StatusLevel | undefined => CLEANING_PHASE_LEVELS[phase ?? ""];

export const getCleaningPhaseBadge = (phase: string | null | undefined) =>
  badgeClass(getCleaningPhaseLevel(phase));

export const getCleaningPhasePill = (phase: string | null | undefined) =>
  pillClass(getCleaningPhaseLevel(phase));

export const getCleaningPhaseBorder = (phase: string | null | undefined) =>
  borderClass(getCleaningPhaseLevel(phase));

/**
 * Etiqueta en castellano. Antes el operario veía la fase en inglés crudo
 * («Assigned», «InExecution») mientras el supervisor la veía traducida, para la
 * misma tarea.
 */
export const getCleaningPhaseLabel = (phase: string | null | undefined) =>
  CLEANING_PHASE_LABELS[phase ?? ""] ?? phase ?? "Sin estado";
