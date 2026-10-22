import {
  ArrowLeft,
  Box,
  Check,
  CheckCircle2,
  RotateCcw,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { CorrectiveDocumentationTab } from "@/modules/incidentes/components/corrective/CorrectiveDocumentationTab";
import { CorrectiveSummaryCard } from "@/modules/incidentes/components/corrective/CorrectiveSummaryCard";
import { WorkDatesCard } from "@/modules/incidentes/components/corrective/WorkDatesCard";
import {
  getCorrectiveStatusLabel,
  getCorrectiveStatusPill,
} from "@/modules/incidentes/constants/correctiveStatus";
import { CorrectiveReassignSheet } from "@/modules/supervisor-mantenimiento/components/CorrectiveReassignSheet";
import { MaintenanceEvidence } from "@/modules/supervisor-mantenimiento/components/MaintenanceEvidence";
import { NotesReasonSheet } from "@/modules/supervisor-mantenimiento/components/NotesReasonSheet";
import {
  getApiErrorMessage,
  getMaintenanceDetail,
  getMaintenanceEvidence,
  rejectCorrective,
  reviewCorrective,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  MaintenanceEvidence as MaintenanceEvidenceItem,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import {
  getCorrectiveActions,
  getCorrectiveNotice,
} from "@/modules/supervisor-mantenimiento/utils/correctiveDetailRules";
import { ActionNotice } from "@/shared/components/ActionNotice";
import { formatReporter } from "@/shared/utils/reporterLabel";
import { categoryLabel } from "@/shared/utils/categoryLabel";
import { DetailTabs } from "@/shared/components/DetailTabs";
import { NotesLogCard } from "@/shared/components/NotesLogCard";
import { ReportDetailCard } from "@/shared/components/ReportDetailCard";
import { withoutCode } from "@/shared/utils/locationLabel";

type Tab = "report" | "documentation";
type Sheet = "reassign" | "reject" | "reopen" | null;

const TABS: { value: Tab; label: string }[] = [
  { value: "report", label: "Reporte" },
  { value: "documentation", label: "Documentación" },
];

const primaryButton =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:opacity-60";
const secondaryButton =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10";

const dangerButton =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-red-300 bg-white px-4 text-[15px] font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200";

/** Detalle del correctivo para el supervisor de mantenimiento. */
export const CorrectiveSupervisorDetailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams();

  const [maintenance, setMaintenance] = useState<SupervisedMaintenance | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // La pantalla de asignación vuelve aquí con su mensaje de éxito
  const [banner, setBanner] = useState<string | null>(
    (location.state as { banner?: string } | null)?.banner ?? null,
  );

  // Se consume una vez: al recargar o volver atrás no debe repetirse
  useEffect(() => {
    if ((location.state as { banner?: string } | null)?.banner) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);
  const [tab, setTab] = useState<Tab>("report");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [evidence, setEvidence] = useState<MaintenanceEvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  // Cada avance consume la actividad del paso: no se permite un doble envío
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setMaintenance(
        (await getMaintenanceDetail("corrective", Number(id))).data,
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo cargar el correctivo"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadEvidence = useCallback(() => {
    setEvidenceLoading(true);
    getMaintenanceEvidence("corrective", Number(id))
      .then((response) => setEvidence(response.data))
      .catch(() => setEvidence([]))
      .finally(() => setEvidenceLoading(false));
  }, [id]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  const applyUpdate = (updated: SupervisedMaintenance, message: string) => {
    setMaintenance(updated);
    setSheet(null);
    setBanner(message);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const approve = async () => {
    if (!maintenance || approving) return;

    try {
      setApproving(true);
      applyUpdate(
        (await reviewCorrective(maintenance.id, true)).data,
        "Cierre aprobado.",
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo aprobar el cierre"));
    } finally {
      setApproving(false);
    }
  };

  const actions = maintenance ? getCorrectiveActions(maintenance) : null;
  const notice = maintenance ? getCorrectiveNotice(maintenance) : null;

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/supervisor-mantenimiento")}
                aria-label="Volver"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-sm font-medium text-slate-600">Correctivo</p>
                <h1 className="text-lg font-bold text-slate-900">
                  {maintenance?.number ?? "Detalle"}
                </h1>
              </div>
            </div>

            {maintenance ? (
              <span className={getCorrectiveStatusPill(maintenance.statusCode)}>
                {getCorrectiveStatusLabel(
                  maintenance.statusCode,
                  maintenance.status,
                )}
              </span>
            ) : null}
          </div>
        </header>

        <div
          className={`space-y-5 px-4 py-5 ${tab === "documentation" ? "pb-28" : ""}`}
        >
          {loading && !maintenance ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-slate-600 shadow-sm">
              Cargando correctivo...
            </section>
          ) : null}

          {error ? (
            <section
              role="alert"
              className="rounded-3xl bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </section>
          ) : null}

          {banner ? (
            <section
              role="status"
              className="flex items-start gap-3 rounded-3xl bg-emerald-50 p-4 text-sm text-emerald-800"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
              <p>{banner}</p>
            </section>
          ) : null}

          {maintenance && actions ? (
            <>
              {notice ? <ActionNotice {...notice} /> : null}

              <CorrectiveSummaryCard
                description={maintenance.subject}
                priority={maintenance.priority?.code}
                category={categoryLabel(
                  maintenance.category,
                  maintenance.subcategory,
                )}
                location={
                  [maintenance.site, maintenance.floor, maintenance.area]
                    .map(withoutCode)
                    .filter(Boolean)
                    .join(" · ") || null
                }
                reporter={formatReporter(maintenance.reporter)}
                reportedAt={maintenance.openingDate}
                responsible={
                  maintenance.assignee
                    ? [maintenance.assignee.name, maintenance.team?.name]
                        .filter(Boolean)
                        .join(" · ")
                    : null
                }
                extra={
                  maintenance.asset
                    ? {
                        icon: Box,
                        label: "Equipo intervenido",
                        value: maintenance.asset.name,
                      }
                    : null
                }
              />

              <DetailTabs
                label="Secciones del correctivo"
                tabs={TABS}
                value={tab}
                onChange={setTab}
              />

              {tab === "report" ? (
                <>
                  <ReportDetailCard notes={maintenance.reportNotes} />
                  {evidenceLoading || evidence.length > 0 ? (
                    <MaintenanceEvidence
                      images={evidence}
                      loading={evidenceLoading}
                    />
                  ) : null}
                  <WorkDatesCard
                    plannedStart={maintenance.plannedStart}
                    execStartDate={maintenance.execStartDate}
                    execEndDate={maintenance.execEndDate}
                  />
                  <NotesLogCard
                    entries={maintenance.log}
                    emptyMessage={
                      actions.canAssign
                        ? "Aún no hay notas. Puedes dejar una al asignar el correctivo."
                        : undefined
                    }
                  />

                  {actions.canAssign ? (
                    <div className="space-y-3 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/supervisor-mantenimiento/corrective/${id}/asignar`,
                          )
                        }
                        className={primaryButton}
                      >
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Asignar y programar
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheet("reject")}
                        className={dangerButton}
                      >
                        <XCircle className="h-4 w-4" aria-hidden />
                        Rechazar y cerrar
                      </button>
                    </div>
                  ) : null}

                  {actions.pendingReview ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setSheet("reopen")}
                        className={secondaryButton}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        Reabrir
                      </button>
                      <button
                        type="button"
                        onClick={() => void approve()}
                        disabled={approving}
                        className={primaryButton}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        {approving ? "Aprobando..." : "Aprobar"}
                      </button>
                    </div>
                  ) : null}

                  {actions.canReassign ? (
                    <button
                      type="button"
                      onClick={() => setSheet("reassign")}
                      className={secondaryButton}
                    >
                      <Users className="h-4 w-4" aria-hidden />
                      Reasignar responsable
                    </button>
                  ) : null}
                </>
              ) : null}

              <CorrectiveDocumentationTab
                id={String(maintenance.id)}
                active={tab === "documentation"}
                canManage={!maintenance.isClosed}
                onAttachmentsChange={loadEvidence}
              />
            </>
          ) : null}
        </div>
      </main>

      {maintenance && sheet === "reassign" ? (
        <CorrectiveReassignSheet
          maintenance={maintenance}
          onClose={() => setSheet(null)}
          onSuccess={(updated) =>
            applyUpdate(
              updated,
              `Reasignado a ${updated.assignee?.name ?? "el responsable"}.`,
            )
          }
        />
      ) : null}

      {maintenance && sheet === "reject" ? (
        <NotesReasonSheet
          title="Rechazar y cerrar"
          subtitle={[maintenance.number, maintenance.subject]
            .filter(Boolean)
            .join(" · ")}
          warning="El correctivo se cerrará como cancelado y ya no podrá asignarse."
          tone="danger"
          confirmLabel="Rechazar y cerrar"
          placeholder="Explica por qué no procede este correctivo…"
          onClose={() => setSheet(null)}
          onConfirm={async (notes) => {
            try {
              applyUpdate(
                (await rejectCorrective(maintenance.id, notes)).data,
                "Correctivo rechazado y cerrado.",
              );
            } catch (err) {
              throw new Error(
                getApiErrorMessage(err, "No se pudo rechazar el correctivo"),
              );
            }
          }}
        />
      ) : null}

      {maintenance && sheet === "reopen" ? (
        <NotesReasonSheet
          title="Reabrir correctivo"
          subtitle={[maintenance.number, maintenance.subject]
            .filter(Boolean)
            .join(" · ")}
          warning="El correctivo vuelve a asignación con el mismo responsable y equipo para que repita el trabajo. No se cierra."
          tone="neutral"
          confirmLabel="Reabrir"
          placeholder="Explica qué falta o qué no quedó bien…"
          onClose={() => setSheet(null)}
          onConfirm={async (notes) => {
            try {
              applyUpdate(
                (await reviewCorrective(maintenance.id, false, notes)).data,
                "Correctivo reabierto: vuelve a asignación.",
              );
            } catch (err) {
              throw new Error(
                getApiErrorMessage(err, "No se pudo reabrir el correctivo"),
              );
            }
          }}
        />
      ) : null}
    </AppLayout>
  );
};
