import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Lock,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  getPreventiveStatusLabel,
  getPreventiveStatusPill,
} from "@/modules/incidentes/constants/preventiveStatus";
import { PreventiveAssignSheet } from "@/modules/supervisor-mantenimiento/components/PreventiveAssignSheet";
import { MaintenanceEvidence } from "@/modules/supervisor-mantenimiento/components/MaintenanceEvidence";
import { PlannedStartSheet } from "@/modules/supervisor-mantenimiento/components/PlannedStartSheet";
import {
  getApiErrorMessage,
  getMaintenanceDetail,
  getMaintenanceEvidence,
  resumePreventive,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  MaintenanceEvidence as MaintenanceEvidenceItem,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";

import { formatDayMonthYearTime } from "@/shared/utils/dateUtils";
import { withoutCode } from "@/shared/utils/locationLabel";

const formatDateTime = (value: string | null) =>
  formatDayMonthYearTime(value, "—");

type RowProps = { label: string; value: string | null; highlight?: string };

const InfoRow = ({ label, value, highlight }: RowProps) => (
  <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-3">
    <span className="text-sm text-slate-500">{label}</span>
    <span
      className={`text-right text-sm font-medium ${highlight ?? "text-slate-900"}`}
    >
      {value ?? "—"}
    </span>
  </div>
);

type Modal = "assign" | "reassign" | "planned-start" | null;

/** Detalle del preventivo para el supervisor; el correctivo tiene su propia página. */
export const PreventiveSupervisorDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const maintenanceKind = "preventive" as const;

  const [maintenance, setMaintenance] = useState<SupervisedMaintenance | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<MaintenanceEvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  // Cada avance consume la actividad del paso: si una segunda petición sale
  // antes de que vuelva la primera, llega con un id ya gastado y openMAINT
  // responde con un volcado de Java. Este cerrojo lo evita.
  const [resuming, setResuming] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getMaintenanceDetail(maintenanceKind, Number(id));
      setMaintenance(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo cargar el mantenimiento"));
    } finally {
      setLoading(false);
    }
  }, [id, maintenanceKind]);

  useEffect(() => {
    void load();
  }, [load]);

  // La evidencia se pide aparte para que las fotos no retrasen el detalle, y un
  // fallo al traerlas no impida supervisar el mantenimiento.
  useEffect(() => {
    let cancelled = false;

    const loadEvidence = async () => {
      setEvidenceLoading(true);

      try {
        const response = await getMaintenanceEvidence(
          maintenanceKind,
          Number(id),
        );
        if (!cancelled) setEvidence(response.data);
      } catch {
        if (!cancelled) setEvidence([]);
      } finally {
        if (!cancelled) setEvidenceLoading(false);
      }
    };

    void loadEvidence();

    return () => {
      cancelled = true;
    };
  }, [id, maintenanceKind]);

  const applyUpdate = (updated: SupervisedMaintenance, message: string) => {
    setMaintenance(updated);
    setModal(null);
    setBanner(message);
  };

  const code = maintenance?.statusCode ?? "";
  const badge = getPreventiveStatusPill(code);
  const statusLabel = maintenance
    ? getPreventiveStatusLabel(maintenance.statusCode, maintenance.status)
    : "";

  // Asignar avanza Planificación → Aceptación; la fecha solo se fija después
  const canAssign = maintenance !== null && code === "Planning";

  /** Reasignar cambia la persona sin mover el flujo, una vez despachado. */
  const canReassign =
    maintenance !== null &&
    Boolean(maintenance.assignee) &&
    !maintenance.isClosed &&
    ["Acceptance", "Execution", "Suspension"].includes(code);

  /** `PM04-Suspension` solo ofrece reanudar o cambiar de responsable. */
  const canResume = code === "Suspension";

  /** `ExpExecStartDate` solo es escribible en PM02. */
  const canPlanStart =
    maintenance !== null && !maintenance.isClosed && code === "Acceptance";

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/supervisor-mantenimiento")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Preventivo
                </p>
                <h1 className="text-base font-semibold text-slate-900">
                  {maintenance?.number ?? "Detalle"}
                </h1>
              </div>
            </div>

            {maintenance ? <span className={badge}>{statusLabel}</span> : null}
          </div>
        </header>

        <div className="space-y-5 px-4 py-5 pb-28">
          {loading ? (
            <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">
              Cargando mantenimiento...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 shadow-sm">
              {error}
            </div>
          ) : null}

          {banner ? (
            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p>{banner}</p>
            </div>
          ) : null}

          {maintenance ? (
            <>
              {canResume ? (
                <section className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <PauseCircle className="h-5 w-5 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Mantenimiento suspendido
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {maintenance.suspensionReason
                      ? `Se suspendió por: ${maintenance.suspensionReason}.`
                      : "Está detenido a la espera de poder continuar."}{" "}
                    Al reanudarlo vuelve a ejecución y{" "}
                    {maintenance.assignee?.name ?? "el responsable"} puede
                    retomar el checklist donde lo dejó.
                  </p>

                  <button
                    type="button"
                    disabled={resuming}
                    onClick={async () => {
                      if (resuming) return;

                      try {
                        setResuming(true);
                        const response = await resumePreventive(maintenance.id);
                        applyUpdate(response.data, "Mantenimiento reanudado.");
                      } catch (err) {
                        setError(
                          getApiErrorMessage(
                            err,
                            "No se pudo reanudar el mantenimiento",
                          ),
                        );
                      } finally {
                        setResuming(false);
                      }
                    }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <PlayCircle className="h-4 w-4" />
                    {resuming ? "Reanudando..." : "Reanudar tarea"}
                  </button>
                </section>
              ) : null}

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-bold text-slate-900">
                  Datos del mantenimiento
                </h2>
                <div className="space-y-2">
                  <InfoRow label="Número" value={maintenance.number} />
                  <InfoRow label="Descripción" value={maintenance.subject} />
                  <InfoRow
                    label="Ubicación"
                    value={withoutCode(maintenance.site)}
                  />
                </div>
              </section>

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-bold text-slate-900">
                  Programación
                </h2>
                <div className="space-y-2">
                  <InfoRow
                    label="Apertura"
                    value={formatDateTime(maintenance.openingDate)}
                  />
                  <InfoRow
                    label="Inicio previsto"
                    value={
                      maintenance.plannedStart
                        ? formatDateTime(maintenance.plannedStart)
                        : "Sin planificar"
                    }
                    highlight={
                      maintenance.plannedStart ? undefined : "text-slate-400"
                    }
                  />
                  <InfoRow
                    label="Inicio real de ejecución"
                    value={
                      maintenance.execStartDate
                        ? formatDateTime(maintenance.execStartDate)
                        : "Sin iniciar"
                    }
                    highlight={
                      maintenance.execStartDate ? undefined : "text-amber-700"
                    }
                  />
                  <InfoRow
                    label="Fin de ejecución"
                    value={
                      maintenance.execEndDate
                        ? formatDateTime(maintenance.execEndDate)
                        : "—"
                    }
                  />
                </div>

                {canPlanStart ? (
                  <button
                    type="button"
                    onClick={() => setModal("planned-start")}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <CalendarClock className="h-4 w-4" />
                    {maintenance.plannedStart
                      ? "Editar inicio previsto"
                      : "Planificar inicio de ejecución"}
                  </button>
                ) : null}

                {/* Fuera del paso de asignación openMAINT bloquea el campo, así
                    que se explica en vez de ofrecer un botón que fallaría. */}
                {!canPlanStart && !maintenance.isClosed ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    <Lock className="h-4 w-4 shrink-0" />
                    El inicio previsto solo se puede fijar mientras el
                    mantenimiento está en asignación (tras planificarlo) .
                  </p>
                ) : null}
              </section>

              {evidenceLoading || evidence.length > 0 ? (
                <MaintenanceEvidence
                  images={evidence}
                  loading={evidenceLoading}
                />
              ) : null}

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-bold text-slate-900">
                  Responsable y equipo
                </h2>
                <div className="space-y-2">
                  <InfoRow
                    label="Equipo de trabajo"
                    value={maintenance.team?.name ?? "Sin equipo"}
                    highlight={maintenance.team ? undefined : "text-amber-700"}
                  />
                  <InfoRow
                    label="Responsable"
                    value={maintenance.assignee?.name ?? "Sin responsable"}
                    highlight={
                      maintenance.assignee ? undefined : "text-amber-700"
                    }
                  />
                </div>

                <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <Lock className="h-4 w-4 shrink-0" />
                  En preventivos el equipo lo define el plan de mantenimiento:
                  solo se puede cambiar la persona.
                </p>

                <div className="mt-4 space-y-3">
                  {canAssign ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setModal("assign")}
                        className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white transition hover:bg-brand-hover"
                      >
                        Asignar responsable
                      </button>
                    </div>
                  ) : null}

                  {canReassign ? (
                    <button
                      type="button"
                      onClick={() => setModal("reassign")}
                      className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white transition hover:bg-brand-hover"
                    >
                      Reasignar responsable
                    </button>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>

      {maintenance && (modal === "assign" || modal === "reassign") ? (
        <PreventiveAssignSheet
          maintenance={maintenance}
          mode={modal}
          onClose={() => setModal(null)}
          onSuccess={(updated) =>
            applyUpdate(
              updated,
              modal === "assign"
                ? `Asignado a ${updated.assignee?.name ?? "el responsable"}.`
                : `Reasignado a ${updated.assignee?.name ?? "el responsable"}.`,
            )
          }
        />
      ) : null}

      {maintenance && modal === "planned-start" ? (
        <PlannedStartSheet
          maintenance={maintenance}
          onClose={() => setModal(null)}
          onSuccess={(updated) =>
            applyUpdate(updated, "Inicio previsto guardado.")
          }
        />
      ) : null}
    </AppLayout>
  );
};
