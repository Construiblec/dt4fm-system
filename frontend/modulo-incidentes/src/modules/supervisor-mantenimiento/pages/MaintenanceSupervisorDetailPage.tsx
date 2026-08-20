import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardCheck, Clock, Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  CORRECTIVE_PENDING_REVIEW_STATUS,
  getCorrectiveStatusLabel,
  getCorrectiveStatusPill,
} from "@/modules/incidentes/constants/correctiveStatus";
import {
  getPreventiveStatusLabel,
  getPreventiveStatusPill,
} from "@/modules/incidentes/constants/preventiveStatus";
import { AssignAssigneeModal } from "@/modules/supervisor-mantenimiento/components/AssignAssigneeModal";
import { NotesReasonModal } from "@/modules/supervisor-mantenimiento/components/NotesReasonModal";
import { PlannedStartModal } from "@/modules/supervisor-mantenimiento/components/PlannedStartModal";
import {
  getApiErrorMessage,
  getMaintenanceDetail,
  rejectCorrective,
  reviewCorrective,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  MaintenanceKind,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";

const formatDateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

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

type Modal =
  | "assign"
  | "reassign"
  | "reject"
  | "review-reject"
  | "planned-start"
  | null;

export const MaintenanceSupervisorDetailPage = () => {
  const navigate = useNavigate();
  const { kind = "corrective", id = "" } = useParams();
  const maintenanceKind = kind as MaintenanceKind;

  const [maintenance, setMaintenance] = useState<SupervisedMaintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [banner, setBanner] = useState<string | null>(null);

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

  const applyUpdate = (updated: SupervisedMaintenance, message: string) => {
    setMaintenance(updated);
    setModal(null);
    setBanner(message);
  };

  const isCorrective = maintenanceKind === "corrective";
  const code = maintenance?.statusCode ?? "";

  const badge = isCorrective
    ? getCorrectiveStatusPill(code)
    : getPreventiveStatusPill(code);

  const statusLabel = maintenance
    ? isCorrective
      ? getCorrectiveStatusLabel(maintenance.statusCode, maintenance.status)
      : getPreventiveStatusLabel(maintenance.statusCode, maintenance.status)
    : "";

  // Asignar solo desde el paso de asignación de cada flujo
  const canAssign =
    maintenance !== null &&
    !maintenance.assignee &&
    (isCorrective ? code === "Assignment" : code === "Planning");

  const canReject = isCorrective && code === "Assignment";

  const canReassign =
    maintenance !== null &&
    Boolean(maintenance.assignee) &&
    !maintenance.isClosed &&
    (isCorrective
      ? ["Assignment", "Assigned", "Execution", "Management"].includes(code)
      : ["Acceptance", "Execution", "Suspension"].includes(code));

  const pendingReview = isCorrective && code === CORRECTIVE_PENDING_REVIEW_STATUS;

  /**
   * `ExpExecStartDate` solo es escribible en CM02 (correctivo) y PM02
   * (preventivo). En correctivo eso significa **antes de asignar**: el avance
   * lo lleva a Ejecución y el campo queda bloqueado.
   */
  const canPlanStart =
    maintenance !== null &&
    !maintenance.isClosed &&
    (isCorrective ? code === "Assignment" : code === "Acceptance");

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
                  {isCorrective ? "Correctivo" : "Preventivo"}
                </p>
                <h1 className="text-base font-semibold text-slate-900">
                  {maintenance?.number ?? "Detalle"}
                </h1>
              </div>
            </div>

            {maintenance ? (
              <span
                className={badge}
              >
                {statusLabel}
              </span>
            ) : null}
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
              {code === "Assigned" ? (
                <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                  <Clock className="h-5 w-5 shrink-0" />
                  <p>
                    <span className="font-semibold">Asignado, aún sin iniciar.</span>{" "}
                    En openMAINT el proceso ya avanzó a Ejecución al asignarlo,
                    pero la app no da por iniciado el trabajo ni muestra hora de
                    inicio hasta que el técnico lo arranque.
                  </p>
                </div>
              ) : null}

              {pendingReview ? (
                <section className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Revisión de cierre
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    El trabajo terminó y espera tu visto bueno. Apruébalo, o
                    devuélvelo a asignación para que{" "}
                    {maintenance.assignee?.name ?? "el cesionario"} lo repita.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setModal("review-reject")}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const response = await reviewCorrective(
                            maintenance.id,
                            true,
                          );
                          applyUpdate(response.data, "Cierre aprobado.");
                        } catch (err) {
                          setError(
                            getApiErrorMessage(err, "No se pudo aprobar el cierre"),
                          );
                        }
                      }}
                      className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
                    >
                      Aprobar
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-bold text-slate-900">
                  Datos del mantenimiento
                </h2>
                <div className="space-y-2">
                  <InfoRow label="Número" value={maintenance.number} />
                  <InfoRow label="Descripción" value={maintenance.subject} />
                  <InfoRow label="Sitio" value={maintenance.site} />
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
                    highlight={maintenance.plannedStart ? undefined : "text-slate-400"}
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
                    mantenimiento está en{" "}
                    {isCorrective ? "asignación" : "asignación (tras planificarlo)"}.
                  </p>
                ) : null}
              </section>

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-bold text-slate-900">
                  Cesionario y equipo
                </h2>
                <div className="space-y-2">
                  <InfoRow
                    label="Equipo de trabajo"
                    value={maintenance.team?.name ?? "Sin equipo"}
                    highlight={maintenance.team ? undefined : "text-amber-700"}
                  />
                  <InfoRow
                    label="Cesionario"
                    value={maintenance.assignee?.name ?? "Sin cesionario"}
                    highlight={maintenance.assignee ? undefined : "text-amber-700"}
                  />
                </div>

                {!isCorrective ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    <Lock className="h-4 w-4 shrink-0" />
                    En preventivos el equipo lo define el plan de mantenimiento:
                    solo se puede cambiar la persona.
                  </p>
                ) : null}

                <div className="mt-4 space-y-3">
                  {canAssign ? (
                    <button
                      type="button"
                      onClick={() => setModal("assign")}
                      className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white transition hover:bg-brand-hover"
                    >
                      Asignar cesionario
                    </button>
                  ) : null}

                  {canReassign ? (
                    <button
                      type="button"
                      onClick={() => setModal("reassign")}
                      className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white transition hover:bg-brand-hover"
                    >
                      Reasignar cesionario
                    </button>
                  ) : null}

                  {canReject ? (
                    <button
                      type="button"
                      onClick={() => setModal("reject")}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Rechazar y cerrar
                    </button>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>

      {maintenance && (modal === "assign" || modal === "reassign") ? (
        <AssignAssigneeModal
          maintenance={maintenance}
          mode={modal}
          onClose={() => setModal(null)}
          onSuccess={(updated) =>
            applyUpdate(
              updated,
              modal === "assign"
                ? `Asignado a ${updated.assignee?.name ?? "el cesionario"}.`
                : `Reasignado a ${updated.assignee?.name ?? "el cesionario"}.`,
            )
          }
        />
      ) : null}

      {maintenance && modal === "planned-start" ? (
        <PlannedStartModal
          maintenance={maintenance}
          onClose={() => setModal(null)}
          onSuccess={(updated) =>
            applyUpdate(updated, "Inicio previsto guardado.")
          }
        />
      ) : null}

      {maintenance && modal === "reject" ? (
        <NotesReasonModal
          title="Rechazar y cerrar"
          subtitle={maintenance.number ?? undefined}
          warning="El correctivo se cerrará como Cancelado y no podrá asignarse después."
          tone="danger"
          confirmLabel="Rechazar y cerrar"
          placeholder="Explica por qué no procede este correctivo…"
          onClose={() => setModal(null)}
          onConfirm={async (notes) => {
            try {
              const response = await rejectCorrective(maintenance.id, notes);
              applyUpdate(response.data, "Correctivo rechazado y cerrado.");
            } catch (err) {
              throw new Error(
                getApiErrorMessage(err, "No se pudo rechazar el correctivo"),
              );
            }
          }}
        />
      ) : null}

      {maintenance && modal === "review-reject" ? (
        <NotesReasonModal
          title="Rechazar cierre"
          subtitle={maintenance.number ?? undefined}
          warning="Vuelve a Asignación con el mismo cesionario y equipo para que se repita el trabajo; no se cierra ni vuelve a planificarse."
          tone="neutral"
          confirmLabel="Rechazar"
          placeholder="Explica qué falta o qué no quedó bien…"
          onClose={() => setModal(null)}
          onConfirm={async (notes) => {
            try {
              const response = await reviewCorrective(
                maintenance.id,
                false,
                notes,
              );
              applyUpdate(response.data, "Cierre rechazado: vuelve a asignación.");
            } catch (err) {
              throw new Error(
                getApiErrorMessage(err, "No se pudo rechazar el cierre"),
              );
            }
          }}
        />
      ) : null}
    </AppLayout>
  );
};
