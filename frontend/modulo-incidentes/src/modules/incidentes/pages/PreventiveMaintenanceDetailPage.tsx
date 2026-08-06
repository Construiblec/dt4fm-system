import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Image as ImageIcon,
  PauseCircle,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { PreventiveChecklist } from "@/modules/incidentes/components/PreventiveChecklist";
import { SuspendMaintenanceModal } from "@/modules/incidentes/components/SuspendMaintenanceModal";
import {
  getPreventiveStatusLabel,
  PREVENTIVE_STATUS_BADGE_CLASSES,
} from "@/modules/incidentes/constants/preventiveStatus";
import { usePreventiveChecklist } from "@/modules/incidentes/hooks/usePreventiveChecklist";
import {
  completePreventiveMaintenance,
  getSuspensionReasons,
  savePreventiveChecklist,
  startPreventiveMaintenance,
  suspendPreventiveMaintenance,
} from "@/modules/incidentes/services/preventiveMaintenanceService";
import type {
  PreventiveMaintenanceDetail,
  SuspensionReason,
} from "@/modules/incidentes/types/PreventiveMaintenance";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { SuccessModal } from "@/shared/components/SuccessModal";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

type InfoRowProps = {
  label: string;
  value: string | null;
};

const InfoRow = ({ label, value }: InfoRowProps) => (
  <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-3">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-right text-sm font-medium text-slate-900">
      {value ?? "—"}
    </span>
  </div>
);

export const PreventiveMaintenanceDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [maintenance, setMaintenance] =
    useState<PreventiveMaintenanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // ── Ejecución del checklist y cierre ────────────────────────────────────────
  const checklistItems = maintenance?.checklist ?? [];
  const { answers, setAnswer, completedCount, totalCount, isComplete, payload } =
    usePreventiveChecklist(checklistItems);
  const [observations, setObservations] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  // ── Suspensión ──────────────────────────────────────────────────────────────
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspensionReasons, setSuspensionReasons] = useState<
    SuspensionReason[]
  >([]);
  const [loadingReasons, setLoadingReasons] = useState(false);
  const reasonsRequested = useRef(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [suspendSuccessOpen, setSuspendSuccessOpen] = useState(false);

  const canComplete = Boolean(maintenance?.canComplete) && isComplete;

  const validationMessage = !maintenance?.canComplete
    ? "Este mantenimiento no está en ejecución, no puede finalizarse."
    : !isComplete
      ? `Completa todas las actividades del checklist (${completedCount}/${totalCount} resueltas)`
      : null;

  const handleConfirmComplete = async () => {
    if (!canComplete || isCompleting) {
      setShowConfirmModal(false);
      return;
    }

    try {
      setShowConfirmModal(false);
      setIsCompleting(true);
      setCompleteError(null);

      // OpenMAINT exige el checklist resuelto antes de permitir el cierre
      await savePreventiveChecklist(id, payload);
      await completePreventiveMaintenance(id, observations);

      setSuccessOpen(true);
    } catch {
      setCompleteError("No se pudo finalizar el mantenimiento preventivo");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleConfirmSuspend = async (reasonId: string, notes: string) => {
    if (isSuspending) {
      return;
    }

    try {
      setShowSuspendModal(false);
      setIsSuspending(true);
      setSuspendError(null);

      // `payload` solo lleva las respondidas; el backend marca el resto como N.D.
      await suspendPreventiveMaintenance(id, { reasonId, notes, items: payload });

      setSuspendSuccessOpen(true);
    } catch {
      setSuspendError("No se pudo suspender el mantenimiento preventivo");
    } finally {
      setIsSuspending(false);
    }
  };

  // Los motivos se piden la primera vez que se abre el modal. El ref evita
  // repetir la petición sin meter el flag de carga en las dependencias, que
  // reejecutaría el efecto y descartaría la respuesta en vuelo.
  useEffect(() => {
    if (!showSuspendModal || reasonsRequested.current) {
      return;
    }

    reasonsRequested.current = true;
    setLoadingReasons(true);

    getSuspensionReasons()
      .then(setSuspensionReasons)
      .catch(() => {
        // Se permite reintentar al reabrir el modal
        reasonsRequested.current = false;
        setSuspendError("No se pudieron cargar los motivos de suspensión");
      })
      .finally(() => setLoadingReasons(false));
  }, [showSuspendModal]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!id) {
        setError("Mantenimiento preventivo no encontrado");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Abrir la tarjeta inicia la ejecución: si estaba en Asignación pasa a
        // Ejecución también en OpenMAINT. La llamada es idempotente y devuelve
        // el detalle ya actualizado.
        const data = await startPreventiveMaintenance(id);

        if (isMounted) {
          setMaintenance(data);
        }
      } catch {
        if (isMounted) {
          setError("No se pudo cargar el detalle del mantenimiento preventivo");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
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

            {maintenance ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  PREVENTIVE_STATUS_BADGE_CLASSES[
                    maintenance.statusCode ?? ""
                  ] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {getPreventiveStatusLabel(
                  maintenance.statusCode,
                  maintenance.status,
                )}
              </span>
            ) : null}
          </div>
        </header>

        <div className="space-y-5 px-4 py-5">
          {loading ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-slate-500 shadow-sm">
              Cargando detalle del mantenimiento...
            </section>
          ) : null}

          {!loading && error ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-red-600 shadow-sm">
              {error}
            </section>
          ) : null}

          {!loading && !error && maintenance ? (
            <>
              {/* Solo visible si la reanudación automática al abrir no se aplicó */}
              {maintenance.statusCode === "Suspension" ? (
                <section className="flex items-start gap-2 rounded-3xl bg-violet-50 p-5 shadow-sm ring-1 ring-violet-200">
                  <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                  <div>
                    <p className="text-sm font-semibold text-violet-900">
                      Mantenimiento suspendido
                    </p>
                    <p className="mt-1 text-sm text-violet-700">
                      {maintenance.suspensionReason ?? "Sin motivo registrado"}
                    </p>
                  </div>
                </section>
              ) : null}

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      Datos del mantenimiento
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">
                      {maintenance.subject ?? "Mantenimiento preventivo"}
                    </h2>
                  </div>

                  {maintenance.isOverdue ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                      <AlertTriangle className="h-3 w-3" />
                      Vencido
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 space-y-2">
                  <InfoRow label="Equipo" value={maintenance.equipment} />
                  <InfoRow label="Sitio" value={maintenance.site} />
                  <InfoRow label="Equipo de trabajo" value={maintenance.team} />
                  <InfoRow label="Responsable" value={maintenance.assignee} />
                </div>
              </section>

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">
                  Programación
                </h2>

                <div className="mt-4 space-y-2">
                  <InfoRow
                    label="Inicio previsto"
                    value={formatDateTime(maintenance.expectedStartDate)}
                  />
                  <InfoRow
                    label="Fecha límite"
                    value={formatDateTime(maintenance.dueDate)}
                  />
                  <InfoRow
                    label="Inicio real"
                    value={formatDateTime(maintenance.execStartDate)}
                  />
                </div>
              </section>

              {maintenance.images.length > 0 ? (
                <section className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-slate-500" />
                    <h2 className="text-base font-semibold text-slate-900">
                      Evidencia
                    </h2>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {maintenance.images.map((image, index) => (
                      <div
                        key={`${maintenance.id}-${index}`}
                        className="overflow-hidden rounded-2xl bg-slate-100"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedImage(image)}
                          className="block w-full"
                        >
                          <img
                            src={image}
                            alt={`Evidencia ${index + 1} del mantenimiento ${maintenance.number ?? ""}`}
                            loading="lazy"
                            className="h-32 w-full object-cover transition hover:scale-[1.02]"
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {maintenance.notes !== null ? (
                <section className="rounded-3xl bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-slate-900">
                    Historial de notas
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                    {maintenance.notes}
                  </p>
                </section>
              ) : null}

              <PreventiveChecklist
                items={checklistItems}
                answers={answers}
                onAnswerChange={setAnswer}
                disabled={isCompleting || !maintenance.canComplete}
              />

              {maintenance.canComplete || maintenance.canSuspend ? (
                <>
                  <section className="rounded-3xl bg-white p-5 shadow-sm">
                    <label
                      htmlFor="observations"
                      className="text-base font-semibold text-slate-900"
                    >
                      Observaciones
                    </label>
                    <textarea
                      id="observations"
                      rows={4}
                      maxLength={1000}
                      placeholder="Describe cualquier hallazgo del mantenimiento"
                      value={observations}
                      onChange={(event) => setObservations(event.target.value)}
                      className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                    />
                  </section>

                  <section className="rounded-3xl bg-white p-5 shadow-sm">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {completedCount}/{totalCount} actividades resueltas
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {validationMessage ??
                          "Checklist completo. Ya puedes finalizar el mantenimiento."}
                      </p>
                    </div>

                    {/* Suspender no depende del progreso del checklist */}
                    {maintenance.canSuspend ? (
                      <button
                        type="button"
                        onClick={() => setShowSuspendModal(true)}
                        disabled={isSuspending || isCompleting}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <PauseCircle className="h-4 w-4" />
                        {isSuspending ? "Suspendiendo..." : "Suspender"}
                      </button>
                    ) : null}

                    {maintenance.canComplete ? (
                      <button
                        type="button"
                        onClick={() => setShowConfirmModal(true)}
                        disabled={!canComplete || isCompleting}
                        className={`mt-3 w-full rounded-2xl px-4 py-4 text-sm font-semibold text-white shadow-sm transition ${
                          canComplete && !isCompleting
                            ? "bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                            : "cursor-not-allowed bg-slate-300"
                        }`}
                      >
                        {isCompleting
                          ? "Finalizando mantenimiento..."
                          : "Finalizar mantenimiento"}
                      </button>
                    ) : null}
                  </section>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <ConfirmModal
          open={showConfirmModal}
          title="Confirmar acción"
          message="¿Está seguro que desea finalizar este mantenimiento preventivo? El checklist se guardará en OpenMAINT y no podrá modificarse."
          onConfirm={() => void handleConfirmComplete()}
          onCancel={() => setShowConfirmModal(false)}
        />

        <LoadingModal
          open={isCompleting}
          message="Finalizando mantenimiento..."
        />

        <SuccessModal
          open={successOpen}
          incidentId={maintenance?.id ?? null}
          title="Mantenimiento completado"
          message="El mantenimiento preventivo fue finalizado correctamente."
          buttonLabel="Volver al Dashboard"
          onClose={() => {
            setSuccessOpen(false);
            navigate("/dashboard");
          }}
        />

        <ErrorModal
          open={completeError !== null}
          title="No se pudo finalizar el mantenimiento"
          message={completeError ?? "No se pudo finalizar el mantenimiento"}
          onClose={() => setCompleteError(null)}
        />

        <SuspendMaintenanceModal
          open={showSuspendModal}
          reasons={suspensionReasons}
          loadingReasons={loadingReasons}
          isSubmitting={isSuspending}
          onConfirm={(reasonId, notes) =>
            void handleConfirmSuspend(reasonId, notes)
          }
          onCancel={() => setShowSuspendModal(false)}
        />

        <LoadingModal
          open={isSuspending}
          message="Suspendiendo mantenimiento..."
        />

        <SuccessModal
          open={suspendSuccessOpen}
          incidentId={maintenance?.id ?? null}
          title="Mantenimiento suspendido"
          message="Las actividades sin completar se registraron como N.D. y volverán a estar pendientes al reanudar."
          buttonLabel="Volver al Dashboard"
          onClose={() => {
            setSuspendSuccessOpen(false);
            navigate("/dashboard");
          }}
        />

        <ErrorModal
          open={suspendError !== null}
          title="No se pudo suspender el mantenimiento"
          message={suspendError ?? ""}
          onClose={() => setSuspendError(null)}
        />

        {selectedImage ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 px-4 py-6"
            onClick={() => setSelectedImage(null)}
          >
            <div
              className="relative w-full max-w-md"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-900 shadow-sm"
              >
                Cerrar
              </button>

              <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
                <img
                  src={selectedImage}
                  alt="Vista ampliada de evidencia"
                  className="max-h-[80vh] w-full object-contain bg-slate-950"
                />
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
};
