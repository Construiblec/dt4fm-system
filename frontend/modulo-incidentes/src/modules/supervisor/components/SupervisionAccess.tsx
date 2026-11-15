import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import {
  getSupervisionPhaseLabel,
  getSupervisionPhasePill,
  isOpenSupervision,
} from "@/modules/supervisor/constants/supervisionStatus";
import type { CleaningTaskDetail } from "@/modules/supervisor/types/SupervisorTask";
import { getCurrentRole } from "@/shared/auth/session";

/**
 * Entrada a la supervisión desde la ficha de una limpieza. Solo
 * SupervisorLimpieza tiene el panel; el resto ve el estado, sin enlace.
 *
 * Una limpieza `Completed` anterior al corte no se supervisa: queda así.
 */
export const SupervisionAccess = ({ detail }: { detail: CleaningTaskDetail }) => {
  const isPanel = getCurrentRole() === "SupervisorLimpieza";
  const supervision = detail.supervision ?? null;

  if (supervision) {
    const open = isOpenSupervision(supervision.phase);
    return (
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">Supervisión</p>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${getSupervisionPhasePill(supervision.phase)}`}
          >
            {getSupervisionPhaseLabel(supervision.phase)}
          </span>
        </div>
        {supervision.corrector ? (
          <p className="text-xs text-slate-500">
            Corrector: {supervision.corrector.name}
          </p>
        ) : null}
        {isPanel ? (
          <Link
            to={
              open && detail.phase === "Completed"
                ? `/supervision/tarea/${detail.id}`
                : `/supervision/${supervision.id}`
            }
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-bold text-white shadow-md transition hover:bg-brand-hover"
          >
            <ClipboardCheck className="h-5 w-5" aria-hidden />
            {open ? "Continuar supervisión" : "Ver supervisión"}
          </Link>
        ) : null}
      </div>
    );
  }

  if (detail.phase !== "Completed") return null;

  if (!detail.supervisionEligible) {
    return (
      <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
        Limpieza anterior a la supervisión: no se supervisa.
      </p>
    );
  }

  return isPanel ? (
    <Link
      to={`/supervision/tarea/${detail.id}`}
      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-bold text-white shadow-md transition hover:bg-brand-hover"
    >
      <ClipboardCheck className="h-5 w-5" aria-hidden />
      Supervisar limpieza
    </Link>
  ) : null;
};
