import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, CircleCheck, RefreshCw } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { TaskObservations } from "@/modules/supervisor/components/TaskObservations";
import { FindingCard } from "@/modules/supervisor/components/FindingCard";
import {
  Avatar,
  SectionLabel,
  SupervisionHeader,
} from "@/modules/supervisor/components/SupervisionHeader";
import {
  getSupervisionPhaseLabel,
  getSupervisionPhasePill,
} from "@/modules/supervisor/constants/supervisionStatus";
import { useSupervision } from "@/modules/supervisor/hooks/useSupervision";
import {
  approveSupervision,
  confirmSupervision,
  describeSupervisionError,
} from "@/modules/supervisor/services/supervisionService";
import {
  countPhotos,
  findingsByArea,
  pendingFindings,
  plural,
  resolvedFindings,
} from "@/modules/supervisor/utils/supervisionView";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { formatDayMonthYear } from "@/shared/utils/dateUtils";
import { formatEmployeeName } from "@/shared/utils/nameUtils";

type Pending = "confirm" | "approve" | null;

const StatTile = ({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "amber" | "slate";
}) => (
  <div
    className={`flex-1 rounded-2xl p-3 ${tone === "amber" ? "bg-amber-50" : "bg-slate-100"}`}
  >
    <p
      className={`text-2xl font-bold ${tone === "amber" ? "text-amber-700" : "text-slate-700"}`}
    >
      {value}
    </p>
    <p
      className={`text-xs font-semibold ${tone === "amber" ? "text-amber-800" : "text-slate-600"}`}
    >
      {label}
    </p>
  </div>
);

/**
 * Pantalla 4 · Resumen. Muestra fase, novedades, fotos y Corrector. «Confirmar
 * arreglos» habilita «Aprobar unidad»; aprobar deja la limpieza `Reviewed`.
 * Sin novedades, se aprueba directo desde el borrador.
 */
export const SupervisionSummaryPage = () => {
  const navigate = useNavigate();
  const { id: rawId = "" } = useParams();
  const id = Number(rawId);
  const { supervision, isLoading, isError, setSupervision } =
    useSupervision(id);

  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Exclude<Pending, null>) => {
    setPending(null);
    try {
      setWorking(true);
      const { data } =
        action === "confirm"
          ? await confirmSupervision(id)
          : await approveSupervision(id);
      setSupervision(data);
    } catch (err) {
      setError(
        describeSupervisionError(
          err,
          action === "confirm"
            ? "No se pudieron confirmar los arreglos."
            : "No se pudo aprobar la unidad. Vuelve a intentarlo: se completa lo que faltó.",
        ),
      );
    } finally {
      setWorking(false);
    }
  };

  const allFindings = supervision?.findings ?? [];
  // Las resueltas por el supervisor no van a corrección: se muestran aparte.
  const findings = pendingFindings(allFindings);
  const resolved = resolvedFindings(allFindings);
  const areas = supervision
    ? findingsByArea(supervision.checklist.areas, allFindings)
    : [];
  const phase = supervision?.phase ?? null;
  const canReassign = phase === "InCorrection" || phase === "Fixed";

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 pb-10">
        <SupervisionHeader
          kicker={supervision?.unit?.description ?? "Supervisión"}
          title="Resumen de supervisión"
          onBack={() => navigate("/supervisor")}
          aside={
            supervision?.task?.actualEndTime ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {formatDayMonthYear(supervision.task.actualEndTime)}
              </span>
            ) : null
          }
        />

        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
          {isError ? (
            <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
              No se pudo cargar la supervisión.
            </p>
          ) : null}

          {supervision ? (
            <>
              <div className="flex items-center justify-between">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getSupervisionPhasePill(phase)}`}
                >
                  {getSupervisionPhaseLabel(phase)}
                </span>
                {supervision.supervisor ? (
                  <span className="text-xs text-slate-500">
                    Supervisó {formatEmployeeName(supervision.supervisor.name)}
                  </span>
                ) : null}
              </div>

              {phase === "Approved" ? (
                <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  Unidad aprobada: la limpieza quedó revisada.
                </p>
              ) : null}
              {phase === "Cancelled" ? (
                <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
                  Esta supervisión se anuló: la limpieza se reabrió o la unidad
                  tiene una limpieza más reciente.
                </p>
              ) : null}

              <div className="flex gap-3">
                <StatTile
                  value={findings.length}
                  label="Por corregir"
                  tone="amber"
                />
                <StatTile
                  value={resolved.length}
                  label={resolved.length === 1 ? "Resuelta" : "Resueltas"}
                  tone="slate"
                />
                <StatTile
                  value={countPhotos(allFindings)}
                  label="Fotos"
                  tone="slate"
                />
              </div>

              <TaskObservations task={supervision.task} collapsible />

              <section className="space-y-2 rounded-3xl bg-white p-5 shadow-sm">
                <SectionLabel>Por área</SectionLabel>
                <ul className="space-y-2">
                  {areas.map((area) => (
                    <li
                      key={area.name}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm"
                    >
                      <span className="font-semibold text-slate-900">
                        {area.name}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          area.count > 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {area.count > 0
                          ? plural(area.count, "novedad", "novedades")
                          : "Sin novedades"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {findings.length > 0 ? (
                <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
                  <SectionLabel>Correcciones</SectionLabel>

                  {supervision.corrector ? (
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={formatEmployeeName(supervision.corrector.name)}
                        active
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {formatEmployeeName(supervision.corrector.name)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Corrector ·{" "}
                          {plural(findings.length, "novedad", "novedades")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Todavía no se asignó quién corrige.
                    </p>
                  )}

                  {findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}

                  {supervision.can.confirm ? (
                    <button
                      type="button"
                      onClick={() => setPending("confirm")}
                      disabled={working}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-600 px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                    >
                      <CircleCheck className="h-5 w-5" aria-hidden />
                      Confirmar arreglos
                    </button>
                  ) : null}

                  {canReassign ? (
                    <Link
                      to={`/supervision/${id}/asignar`}
                      className="flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-brand"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                      Reasignar
                    </Link>
                  ) : null}

                  {phase === "Draft" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        to={`/supervision/${id}/checklist`}
                        className="flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700"
                      >
                        Volver al checklist
                      </Link>
                      <Link
                        to={`/supervision/${id}/asignar`}
                        className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-3 text-sm font-semibold text-white"
                      >
                        Asignar
                      </Link>
                    </div>
                  ) : null}
                </section>
              ) : phase === "Draft" ? (
                <Link
                  to={`/supervision/${id}/checklist`}
                  className="block text-center text-sm font-semibold text-brand"
                >
                  Volver al checklist
                </Link>
              ) : null}

              {resolved.length > 0 ? (
                <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
                  <SectionLabel>
                    Resueltas por el supervisor · {resolved.length}
                  </SectionLabel>
                  <p className="text-xs text-slate-500">
                    No se envían a corrección.
                  </p>
                  {resolved.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </section>
              ) : null}

              {phase !== "Approved" && phase !== "Cancelled" ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setPending("approve")}
                    disabled={!supervision.can.approve || working}
                    className="min-h-14 w-full rounded-2xl bg-brand px-4 text-sm font-bold text-white shadow-md transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
                  >
                    Aprobar unidad
                  </button>
                  {!supervision.can.approve ? (
                    <p className="mt-2 text-center text-xs text-slate-500">
                      Se habilita cuando confirmes los arreglos.
                    </p>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/supervisor")}
                  className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
                >
                  Volver al panel
                </button>
              )}
            </>
          ) : null}
        </div>

        <LoadingModal
          open={isLoading || working}
          message={working ? "Guardando..." : "Cargando resumen..."}
        />
        <ConfirmModal
          open={pending === "confirm"}
          title="Confirmar arreglos"
          message="Confirmas que las correcciones quedaron bien. Después podrás aprobar la unidad."
          onConfirm={() => void run("confirm")}
          onCancel={() => setPending(null)}
        />
        <ConfirmModal
          open={pending === "approve"}
          title="Aprobar unidad"
          message="La limpieza pasará a revisada y la supervisión quedará cerrada."
          onConfirm={() => void run("approve")}
          onCancel={() => setPending(null)}
        />
        <ErrorModal
          open={error !== null}
          title="Resumen de supervisión"
          message={error ?? ""}
          onClose={() => setError(null)}
        />
      </main>
    </AppLayout>
  );
};
