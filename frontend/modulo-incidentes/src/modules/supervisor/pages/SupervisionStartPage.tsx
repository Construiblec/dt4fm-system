import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardX, Play } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  SectionLabel,
  SupervisionHeader,
} from "@/modules/supervisor/components/SupervisionHeader";
import {
  getSupervisionPhaseLabel,
  getSupervisionPhasePill,
  unavailableMessage,
} from "@/modules/supervisor/constants/supervisionStatus";
import { supervisionKey } from "@/modules/supervisor/hooks/useSupervision";
import {
  describeSupervisionError,
  openSupervisionForTask,
  startSupervision,
  unavailableReasonOf,
} from "@/modules/supervisor/services/supervisionService";
import type { SupervisionDetail } from "@/modules/supervisor/types/Supervision";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { formatDayMonthYear, formatTime } from "@/shared/utils/dateUtils";
import { formatEmployeeName } from "@/shared/utils/nameUtils";

/**
 * Pantalla 1 · Inicio. Abre la supervisión de una limpieza `Completed`: la que
 * ya existe o, si falló al finalizar, recupera su borrador. Las limpiezas
 * anteriores al corte o superadas por otra no se supervisan (409 con motivo).
 */
export const SupervisionStartPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { taskId: rawTaskId = "" } = useParams();
  const taskId = Number(rawTaskId);

  const [supervision, setSupervision] = useState<SupervisionDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(taskId) || taskId <= 0) return;
    let cancelled = false;

    openSupervisionForTask(taskId)
      .then(({ data }) => {
        if (cancelled) return;
        setSupervision(data);
        queryClient.setQueryData(supervisionKey(data.id), data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const reason = unavailableReasonOf(err);
        setBlocked(
          reason
            ? (unavailableMessage[reason] ??
                describeSupervisionError(err, "Esta limpieza no se supervisa."))
            : describeSupervisionError(
                err,
                "No se pudo abrir la supervisión de esta limpieza.",
              ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, queryClient]);

  const backToTask = () => navigate(`/supervisor/tasks/${taskId}`);

  const handleStart = async () => {
    if (!supervision) return;
    // Ya avanzó (asignada, corregida...): no hay nada que iniciar, se va al resumen.
    if (!supervision.can.start) {
      navigate(`/supervision/${supervision.id}`);
      return;
    }
    try {
      setStarting(true);
      const { data } = await startSupervision(supervision.id);
      queryClient.setQueryData(supervisionKey(data.id), data);
      navigate(`/supervision/${data.id}/checklist`);
    } catch (err) {
      setError(
        describeSupervisionError(err, "No se pudo iniciar la supervisión."),
      );
    } finally {
      setStarting(false);
    }
  };

  if (!Number.isFinite(taskId) || taskId <= 0) {
    return (
      <AppLayout className="bg-gray-100">
        <div className="p-6 text-sm text-red-600">ID de limpieza inválido.</div>
      </AppLayout>
    );
  }

  const task = supervision?.task ?? null;
  const unitName =
    supervision?.unit?.description ?? task?.description ?? "Unidad sin nombre";
  const cleanedBy = task?.employee?.name
    ? formatEmployeeName(task.employee.name)
    : null;
  const isDraft = supervision?.phase === "Draft";

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 pb-10">
        <SupervisionHeader
          kicker="Supervisión"
          title={isDraft || !supervision ? "Nueva supervisión" : "Supervisión"}
          onBack={backToTask}
        />

        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
          {blocked ? (
            <section className="flex flex-col items-center gap-3 rounded-3xl bg-white p-6 text-center shadow-sm">
              <ClipboardX className="h-10 w-10 text-slate-300" aria-hidden />
              <p className="text-sm text-slate-700">{blocked}</p>
              <button
                type="button"
                onClick={backToTask}
                className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700"
              >
                Volver a la limpieza
              </button>
            </section>
          ) : null}

          {supervision ? (
            <>
              <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <SectionLabel>Unidad a supervisar</SectionLabel>
                  {!isDraft ? (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getSupervisionPhasePill(supervision.phase)}`}
                    >
                      {getSupervisionPhaseLabel(supervision.phase)}
                    </span>
                  ) : null}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {unitName}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {task?.actualEndTime
                      ? `Limpieza terminada ${formatTime(task.actualEndTime)}`
                      : "Limpieza terminada"}
                    {cleanedBy ? ` · ${cleanedBy}` : ""}
                  </p>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm">
                  <span className="text-slate-500">Fecha</span>
                  <span className="font-bold text-slate-900">
                    {formatDayMonthYear(task?.actualEndTime)}
                  </span>
                </div>
              </section>

              <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
                <SectionLabel>
                  Checklist general · {supervision.checklist.totalPoints} puntos
                </SectionLabel>
                {supervision.checklist.areas.length === 0 ? (
                  <p className="text-sm text-amber-800">
                    No se pudo leer el checklist de supervisión.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {supervision.checklist.areas.map((area) => (
                      <li
                        key={area.name}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm"
                      >
                        <span className="font-semibold text-slate-900">
                          {area.name}
                        </span>
                        <span className="text-slate-500">
                          {area.points.length}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={starting}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-bold text-white shadow-md transition hover:bg-brand-hover disabled:opacity-60"
              >
                <Play className="h-5 w-5" aria-hidden />
                {starting
                  ? "Iniciando..."
                  : supervision.can.start
                    ? "Iniciar supervisión"
                    : "Ver supervisión"}
              </button>
            </>
          ) : null}
        </div>

        <LoadingModal open={loading} message="Abriendo supervisión..." />
        <ErrorModal
          open={error !== null}
          title="Supervisión"
          message={error ?? ""}
          onClose={() => setError(null)}
        />
      </main>
    </AppLayout>
  );
};
