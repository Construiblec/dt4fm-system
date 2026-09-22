import { CheckCircle2 } from "lucide-react";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import {
  countChecklistActivities,
  countCompletedSections,
  formatMinutes,
  getSectionIndices,
  isSectionComplete,
  parseCleaningChecklist,
} from "@/modules/incidentes/utils/cleaningChecklistUtils";
import { useMemo } from "react";

type CleaningTaskChecklistProps = {
  activities: string[];
};

/**
 * `shrink-0` es necesario: sin él el input se comprime dentro del flex cuando
 * el texto es largo, y los cuadros salen de distinto tamaño entre filas.
 */
const CHECKBOX_CLASS =
  "mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500";

/**
 * El operario marca BLOQUES, no actividades: un solo toque por sección.
 *
 * El estado real vive por actividad (es lo que el comando de voz confirma
 * elemento por elemento), pero acá no se muestra: el check del bloque se deriva
 * de que todas sus actividades estén completas, y el tap las escribe todas de
 * una. Por eso tampoco hay contador `x/y` dentro de la tarjeta — delataría una
 * granularidad que tiene que quedar por detrás.
 */
export const CleaningTaskChecklist = ({ activities }: CleaningTaskChecklistProps) => {
  const checklistProgress = useCleaningTaskExecutionStore((state) => state.checklistProgress);
  const setChecklistItems = useCleaningTaskExecutionStore(
    (state) => state.setChecklistItems,
  );
  const progressResetByFormatChange = useCleaningTaskExecutionStore(
    (state) => state.progressResetByFormatChange,
  );

  const sections = useMemo(() => parseCleaningChecklist(activities), [activities]);
  const completedSections = countCompletedSections(sections, checklistProgress);
  const progressPercentage =
    sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Checklist de actividades</h2>
          <p className="mt-1 text-sm text-slate-500">
            {completedSections}/{sections.length} secciones completadas
          </p>
        </div>
        <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan-600" />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-cyan-500 transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* El operario acaba de migrar de la versión con check por sección: sus
          marcas viejas no se podían traducir a las actividades nuevas. Sin este
          aviso reabre su tarea, la ve en blanco y concluye que se perdió todo. */}
      {progressResetByFormatChange && sections.length > 0 ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          El checklist cambió de formato. Vuelve a marcar las secciones que ya hiciste.
        </p>
      ) : null}

      {/* La plantilla llegó pero no se pudo leer ninguna fila. Hay que decirlo:
          sin checks la tarea no se puede finalizar y el empleado no tendría cómo
          saber por qué el botón está muerto. */}
      {activities.length > 0 && countChecklistActivities(sections) === 0 ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No se pudo leer el checklist de esta plantilla. Avisa a tu supervisor.
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        {sections.map((section, sectionIndex) => {
          const checked = isSectionComplete(section, checklistProgress);

          return (
            <label
              key={sectionIndex}
              className={`block cursor-pointer rounded-2xl border p-4 transition ${
                checked
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-slate-50 hover:border-cyan-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    setChecklistItems(getSectionIndices(section), event.target.checked)
                  }
                  className={CHECKBOX_CLASS}
                />
                <span className="flex-1 text-lg font-bold leading-6 text-slate-800">
                  {section.title ?? "Actividades"}
                </span>
                {section.totalMinutes !== null ? (
                  <span className="mt-1 shrink-0 text-xs font-medium text-slate-400">
                    {section.hasPartialMinutes ? "~" : ""}
                    {formatMinutes(section.totalMinutes)}
                  </span>
                ) : null}
              </div>

              <ul className="mt-3 space-y-2 pl-8">
                {section.items.map((item) => (
                  <li
                    key={item.originalIndex}
                    className="flex items-start gap-2 text-sm leading-6 text-slate-600"
                  >
                    <span
                      aria-hidden
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
                    />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </label>
          );
        })}
      </div>
    </section>
  );
};
