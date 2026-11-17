import { ChevronDown } from "lucide-react";
import type { SupervisionDetail } from "@/modules/supervisor/types/Supervision";
import { teamNotes } from "@/modules/supervisor/utils/supervisionView";
import { cleanObservationText } from "@/shared/utils/textUtils";

type Props = {
  task: SupervisionDetail["task"];
  /** En el checklist se puede plegar para no tapar las áreas. */
  collapsible?: boolean;
};

/**
 * «Observaciones» (de la coordinación) y «Observaciones del equipo» (del
 * operario, sin la bitácora de pausas) de la limpieza supervisada.
 */
export const TaskObservations = ({ task, collapsible = false }: Props) => {
  const observations = cleanObservationText(task?.observations) || null;
  const team = teamNotes(task?.teamObservations);
  if (!observations && !team) return null;

  const blocks = (
    <div className="space-y-2">
      {observations ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="mb-1 text-xs font-semibold text-blue-700">
            Observaciones
          </p>
          <p className="whitespace-pre-line text-sm text-blue-900">
            {observations}
          </p>
        </div>
      ) : null}
      {team ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-700">
            Observaciones del equipo
          </p>
          <p className="whitespace-pre-line text-sm text-amber-900">{team}</p>
        </div>
      ) : null}
    </div>
  );

  if (!collapsible) return blocks;

  return (
    <details open className="group rounded-3xl bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 [&::-webkit-details-marker]:hidden">
        Observaciones de la limpieza
        <ChevronDown
          className="h-5 w-5 text-slate-400 transition group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-3">{blocks}</div>
    </details>
  );
};
