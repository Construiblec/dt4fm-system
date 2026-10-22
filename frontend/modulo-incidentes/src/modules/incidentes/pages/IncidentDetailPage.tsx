import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Image as ImageIcon,
  Play,
  Wrench,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  completeIncident,
  startIncident,
} from "@/modules/incidentes/services/completeIncidentService";
import { getIncidentById } from "@/modules/incidentes/services/incidentDetailService";
import type { IncidentDetail } from "@/modules/incidentes/types/IncidentDetail";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import {
  getCorrectiveBlockedReason,
  getCorrectiveStatusLabel,
  getCorrectiveStatusPill,
} from "@/modules/incidentes/constants/correctiveStatus";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { NotesLogCard } from "@/shared/components/NotesLogCard";
import { ReportDetailCard } from "@/shared/components/ReportDetailCard";
import { SuccessModal } from "@/shared/components/SuccessModal";
import { ActionNotice } from "@/shared/components/ActionNotice";
import { formatReporter } from "@/shared/utils/reporterLabel";
import { DetailTabs } from "@/shared/components/DetailTabs";
import { CorrectiveDocumentationTab } from "@/modules/incidentes/components/corrective/CorrectiveDocumentationTab";
import { CorrectiveSummaryCard } from "@/modules/incidentes/components/corrective/CorrectiveSummaryCard";
import { EvidenceGallery } from "@/modules/incidentes/components/corrective/EvidenceGallery";
import { TakePhotoButton } from "@/shared/components/TakePhotoButton";
import { describeImageError, prepareImage } from "@/shared/utils/prepareImage";

import { formatDayMonthYearTime as formatDate } from "@/shared/utils/dateUtils";
import { withoutCode } from "@/shared/utils/locationLabel";
import { categoryLabel } from "@/shared/utils/categoryLabel";

type Tab = "report" | "documentation";

const TABS: { value: Tab; label: string }[] = [
  { value: "report", label: "Reporte" },
  { value: "documentation", label: "Documentación" },
];

export const IncidentDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("report");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolutionImage, setResolutionImage] = useState<File | null>(null);
  const [resolutionPreview, setResolutionPreview] = useState<string | null>(
    null,
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [successComplete, setSuccessComplete] = useState(false);
  const [errorComplete, setErrorComplete] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadIncident = async () => {
      if (!id) {
        setError("Incidente no encontrado");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const data = await getIncidentById(id);

        if (isMounted) {
          setIncident(data);
        }
      } catch {
        if (isMounted) {
          setError("No se pudo cargar el detalle del incidente");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadIncident();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!resolutionImage) {
      setResolutionPreview(null);
      return;
    }

    const previewUrl = URL.createObjectURL(resolutionImage);
    setResolutionPreview(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [resolutionImage]);

  const statusCode = incident?.statusCode ?? null;
  const normalizedStatus = incident
    ? getCorrectiveStatusLabel(statusCode, incident.status)
    : "";

  // «Asignado» significa que el trabajo está despachado pero sin arrancar: no
  // tiene `ExecStartDate`, y sin inicio el backend no deja finalizarlo.
  const isAssigned = statusCode === "Assigned";
  const isInExecution = statusCode === "Execution";
  const blockedReason = incident
    ? getCorrectiveBlockedReason(statusCode)
    : null;

  const handleResolutionImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    try {
      // Copia a memoria y reducida al elegirla: en el móvil el archivo del
      // selector puede dejar de leerse después (ver `prepareImage`), y reducida
      // no choca con el límite de 5 MB de abajo.
      setResolutionImage(await prepareImage(file));
    } catch (error) {
      setResolutionImage(null);
      setErrorComplete(describeImageError(error));
    } finally {
      input.value = "";
    }
  };

  const handleStart = async () => {
    if (!incident) {
      return;
    }

    try {
      setIsStarting(true);
      setErrorComplete(null);

      const result = await startIncident(incident.id);

      // El backend devuelve el estado ya resuelto; si el trabajo venía iniciado
      // conserva el inicio original en vez de pisarlo.
      setIncident({
        ...incident,
        statusCode: result.statusCode,
        execStartDate: result.execStartDate,
      });
    } catch {
      setErrorComplete("No se pudo iniciar el trabajo");
    } finally {
      setIsStarting(false);
    }
  };

  const handleConfirmComplete = async () => {
    if (!incident) {
      return;
    }

    if (resolutionImage && resolutionImage.size > 5 * 1024 * 1024) {
      setShowConfirmModal(false);
      setErrorComplete("La imagen supera el límite de 5MB");
      return;
    }

    if (resolutionImage && !resolutionImage.type.startsWith("image/")) {
      setShowConfirmModal(false);
      setErrorComplete("Solo se permiten imágenes");
      return;
    }

    try {
      setShowConfirmModal(false);
      setIsCompleting(true);
      setErrorComplete(null);

      await completeIncident(incident.id, resolutionNotes, resolutionImage);

      setSuccessComplete(true);
    } catch (error) {
      // `fetch` lanza TypeError cuando no hay respuesta: no es el servidor.
      setErrorComplete(
        error instanceof TypeError
          ? "No se pudo enviar. Revisa la conexión e inténtalo de nuevo."
          : "No se pudo finalizar el incidente",
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const location =
    [
      incident?.building,
      incident?.floor,
      incident?.unit ?? incident?.commonArea,
    ]
      .map(withoutCode)
      .filter(Boolean)
      .join(" · ") || null;

  const summaryExtra =
    isAssigned && incident?.plannedStart
      ? {
          icon: CalendarClock,
          label: "Inicio previsto",
          value: formatDate(incident.plannedStart),
        }
      : isInExecution && incident?.execStartDate
        ? {
            icon: Play,
            label: "Inicio",
            value: formatDate(incident.execStartDate),
          }
        : null;

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                aria-label="Volver"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div>
                <p className="text-sm font-medium text-slate-600">Correctivo</p>
                <h1 className="text-lg font-bold text-slate-900">
                  {incident?.number ?? "Detalle"}
                </h1>
              </div>
            </div>

            {incident ? (
              <span className={getCorrectiveStatusPill(statusCode)}>
                {normalizedStatus}
              </span>
            ) : null}
          </div>
        </header>

        <div
          className={`space-y-5 px-4 py-5 ${tab === "documentation" ? "pb-28" : ""}`}
        >
          {loading ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-slate-600 shadow-sm">
              Cargando detalle del correctivo...
            </section>
          ) : null}

          {!loading && error ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-red-700 shadow-sm">
              {error}
            </section>
          ) : null}

          {!loading && !error && incident ? (
            <>
              {isAssigned ? (
                <ActionNotice
                  tone="blue"
                  title="Tienes este correctivo asignado"
                  message="Empieza cuando llegues al sitio. Al iniciar quedará registrada la fecha y hora."
                />
              ) : !isInExecution ? (
                <ActionNotice
                  tone="slate"
                  title={blockedReason ?? "Este correctivo no admite acciones"}
                />
              ) : null}

              <CorrectiveSummaryCard
                description={incident.location}
                priority={incident.priorityCode ?? incident.priority}
                category={categoryLabel(
                  incident.category,
                  incident.subcategory,
                )}
                location={location}
                reporter={
                  formatReporter(incident.reporter) ??
                  incident.requesterName ??
                  null
                }
                reportedAt={incident.createdAt}
                responsible={incident.assigneeName}
                extra={summaryExtra}
              />

              <DetailTabs
                label="Secciones del correctivo"
                tabs={TABS}
                value={tab}
                onChange={setTab}
              />

              {tab === "report" ? (
                <>
                  <ReportDetailCard notes={incident.reportNotes} />
                  <EvidenceGallery
                    images={incident.images}
                    reference={`el correctivo ${incident.number}`}
                  />
                  <NotesLogCard entries={incident.log} />

                  {isAssigned ? (
                    <button
                      type="button"
                      onClick={handleStart}
                      disabled={isStarting}
                      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:opacity-60"
                    >
                      <Play className="h-4 w-4" aria-hidden />
                      {isStarting ? "Iniciando..." : "Iniciar mantenimiento"}
                    </button>
                  ) : null}

                  {isInExecution ? (
                    <>
                      <section className="rounded-3xl border-2 border-brand bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Wrench
                            className="h-5 w-5 text-slate-500"
                            aria-hidden
                          />
                          <h2 className="text-base font-semibold text-slate-900">
                            Acciones de resolución
                          </h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Cuenta qué hiciste y agrega una foto del resultado.
                        </p>

                        <div className="mt-4 space-y-4">
                          <div className="space-y-2">
                            <label
                              htmlFor="resolutionNotes"
                              className="text-sm font-semibold text-slate-900"
                            >
                              Observaciones
                            </label>
                            <textarea
                              id="resolutionNotes"
                              rows={5}
                              placeholder="Ej.: cambié la válvula de la llave de paso y probé 30 minutos sin goteo."
                              className="w-full resize-none rounded-2xl border border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-brand focus:ring-4 focus:ring-brand/20"
                              value={resolutionNotes}
                              onChange={(event) =>
                                setResolutionNotes(event.target.value)
                              }
                            />
                          </div>

                          <label className="block cursor-pointer rounded-2xl border border-dashed border-slate-400 bg-slate-50 px-4 py-5 text-center focus-within:ring-4 focus-within:ring-brand/20">
                            <ImageIcon
                              className="mx-auto h-5 w-5 text-slate-500"
                              aria-hidden
                            />
                            <p className="mt-2 text-sm font-semibold text-slate-700">
                              Agregar foto del resultado
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              Opcional: elige una imagen de la galería
                            </p>

                            {resolutionPreview ? (
                              <img
                                src={resolutionPreview}
                                alt="Vista previa de la foto del resultado"
                                className="mx-auto mt-4 h-32 w-32 rounded-2xl object-cover shadow-sm"
                              />
                            ) : null}

                            {resolutionImage ? (
                              <p className="mt-3 text-xs font-medium text-slate-700">
                                {resolutionImage.name}
                              </p>
                            ) : null}

                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={handleResolutionImageChange}
                            />
                          </label>

                          <TakePhotoButton
                            onChange={handleResolutionImageChange}
                          />
                        </div>
                      </section>

                      <button
                        type="button"
                        onClick={() => setShowConfirmModal(true)}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        Finalizar correctivo
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}

              <CorrectiveDocumentationTab
                id={String(incident.id)}
                active={tab === "documentation"}
                canManage={isAssigned || isInExecution}
                onAttachmentsChange={() =>
                  void getIncidentById(id)
                    .then((data) =>
                      setIncident((current) =>
                        current ? { ...current, images: data.images } : data,
                      ),
                    )
                    .catch(() => undefined)
                }
              />
            </>
          ) : null}
        </div>

        <ConfirmModal
          open={showConfirmModal}
          title="Finalizar correctivo"
          message="¿Confirmas que el trabajo está terminado?"
          onConfirm={handleConfirmComplete}
          onCancel={() => setShowConfirmModal(false)}
        />
        <LoadingModal open={isCompleting} message="Finalizando correctivo..." />
        <SuccessModal
          open={successComplete}
          title="Correctivo finalizado"
          message="El trabajo quedó registrado y pasa a revisión."
          buttonLabel="Volver al Dashboard"
          onClose={() => navigate("/dashboard")}
        />
        <ErrorModal
          open={errorComplete !== null}
          title="No se pudo completar la acción"
          message={errorComplete ?? "No se pudo finalizar el correctivo"}
          onClose={() => setErrorComplete(null)}
        />
      </main>
    </AppLayout>
  );
};
