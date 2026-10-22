import type { ActionNoticeTone } from "@/shared/components/ActionNotice";
import { formatDayMonthYearTime } from "@/shared/utils/dateUtils";

type CorrectiveState = {
  statusCode: string | null;
  isClosed: boolean;
  assignee: { name: string } | null;
  execEndDate: string | null;
};

export type CorrectiveActions = {
  canAssign: boolean;
  canReject: boolean;
  pendingReview: boolean;
  canReassign: boolean;
};

/** Qué acciones del supervisor admite el correctivo en su estado actual. */
export const getCorrectiveActions = (
  state: CorrectiveState,
): CorrectiveActions => {
  const code = state.statusCode ?? "";

  return {
    // Depende del estado, no del responsable: uno reabierto vuelve con él
    canAssign: code === "Assignment",
    canReject: code === "Assignment",
    pendingReview: code === "Accounting",
    canReassign:
      Boolean(state.assignee) &&
      !state.isClosed &&
      ["Assigned", "Execution", "Management"].includes(code),
  };
};

export type CorrectiveNotice = {
  tone: ActionNoticeTone;
  title: string;
  message: string;
};

/** Aviso que encabeza el detalle, o `null` si no hay nada pendiente. */
export const getCorrectiveNotice = (
  state: CorrectiveState,
): CorrectiveNotice | null => {
  const who = state.assignee?.name ?? "El responsable";

  switch (state.statusCode) {
    case "Assignment":
      return {
        tone: "amber",
        title: "Falta asignar este correctivo",
        message:
          "Define la prioridad, la fecha de inicio y el responsable para que el trabajo pueda empezar.",
      };
    case "Assigned":
      return {
        tone: "amber",
        title: "Asignado, aún sin iniciar",
        message: `${who} todavía no ha empezado el trabajo.`,
      };
    case "Accounting":
      return {
        tone: "indigo",
        title: "El trabajo está listo para revisar",
        message: state.execEndDate
          ? `${who} lo terminó el ${formatDayMonthYearTime(state.execEndDate)}`
          : `${who} lo dio por terminado.`,
      };
    default:
      return null;
  }
};
