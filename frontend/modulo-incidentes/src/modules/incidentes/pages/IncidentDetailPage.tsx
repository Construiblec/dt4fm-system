import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Image as ImageIcon,
  MapPin,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { completeIncident } from "@/modules/incidentes/services/completeIncidentService";
import { getIncidentById } from "@/modules/incidentes/services/incidentDetailService";
import type { IncidentDetail } from "@/modules/incidentes/types/IncidentDetail";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import {
  getCorrectiveStatusLabel,
  getCorrectiveStatusPill,
} from "@/modules/incidentes/constants/correctiveStatus";
import {
  getPriorityLabel,
  PRIORITY_PILL_CLASSES,
  toPriorityCode,
} from "@/shared/constants/priority";
import { PILL_SHAPE } from "@/shared/constants/statusPalette";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { SuccessModal } from "@/shared/components/SuccessModal";

import { formatDateTime as formatDate } from "@/shared/utils/dateUtils";

export const IncidentDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolutionImage, setResolutionImage] = useState<File | null>(null);
  const [resolutionPreview, setResolutionPreview] = useState<string | null>(
    null,
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [successComplete, setSuccessComplete] = useState(false);
  const [errorComplete, setErrorComplete] = useState<string | null>(null);

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

  const priorityCode = incident ? toPriorityCode(incident.priority) : null;

  const handleResolutionImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    setResolutionImage(file);
    event.target.value = "";
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
    } catch {
      setErrorComplete("No se pudo finalizar el incidente");
    } finally {
      setIsCompleting(false);
    }
  };

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
                  Incidente
                </p>
                <h1 className="text-base font-semibold text-slate-900">
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

        <div className="space-y-5 px-4 py-5">
          {loading ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-slate-500 shadow-sm">
              Cargando detalle del incidente...
            </section>
          ) : null}

          {!loading && error ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-red-600 shadow-sm">
              {error}
            </section>
          ) : null}

          {!loading && !error && incident ? (
            <>
              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      Datos del reporte
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">
                      {incident.building}
                    </h2>
                  </div>

                  <span
                    className={`${PILL_SHAPE} ring-1 ${
                      priorityCode
                        ? PRIORITY_PILL_CLASSES[priorityCode]
                        : "bg-slate-50 text-slate-700 ring-slate-200"
                    }`}
                  >
                    Prioridad {getPriorityLabel(priorityCode)}
                  </span>
                </div>

                <div className="mt-5 space-y-4 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">Sitio</p>
                      <p>{incident.building}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">Piso / Area</p>
                      <p>{incident.location}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">Fecha</p>
                      <p>{formatDate(incident.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </section>

              {incident.images.length > 0 ? (
                <section className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-slate-500" />
                    <h2 className="text-base font-semibold text-slate-900">
                      Evidencia del reporte
                    </h2>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {incident.images.map((image, index) => (
                      <div
                        key={`${incident.id}-${index}`}
                        className="overflow-hidden rounded-2xl bg-slate-100"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedImage(image)}
                          className="block w-full"
                        >
                          <img
                            src={image}
                            alt={`Evidencia ${index + 1} del incidente ${incident.number}`}
                            loading="lazy"
                            className="h-32 w-full object-cover transition hover:scale-[1.02]"
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {incident.notes !== null ? (
                <section className="rounded-3xl bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-slate-900">
                    Historial de notas
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                    {incident.notes}
                  </p>
                </section>
              ) : null}

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">
                  Acciones de resolución
                </h2>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="resolutionNotes"
                      className="text-sm font-medium text-slate-700"
                    >
                      Observaciones
                    </label>
                    <textarea
                      id="resolutionNotes"
                      rows={5}
                      placeholder="Describe las acciones realizadas para atender el incidente"
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                      value={resolutionNotes}
                      onChange={(event) => setResolutionNotes(event.target.value)}
                    />
                  </div>

                  <label className="block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
                    <ImageIcon className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700">
                      Adjuntar evidencia de resolución
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Selecciona una imagen opcional
                    </p>

                    {resolutionPreview ? (
                      <img
                        src={resolutionPreview}
                        alt="Vista previa de evidencia de resolución"
                        className="mx-auto mt-4 h-32 w-32 rounded-2xl object-cover shadow-sm"
                      />
                    ) : null}

                    {resolutionImage ? (
                      <p className="mt-3 text-xs font-medium text-slate-600">
                        {resolutionImage.name}
                      </p>
                    ) : null}

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleResolutionImageChange}
                    />
                  </label>
                </div>
              </section>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="w-full rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30"
              >
                Finalizar Incidente
              </button>
            </>
          ) : null}
        </div>

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

        <ConfirmModal
          open={showConfirmModal}
          title="Confirmar acción"
          message="¿Está seguro que desea finalizar este incidente?"
          onConfirm={handleConfirmComplete}
          onCancel={() => setShowConfirmModal(false)}
        />
        <LoadingModal open={isCompleting} message="Finalizando incidente..." />
        <SuccessModal
          open={successComplete}
          incidentId={incident?.id ?? null}
          title="Incidente finalizado correctamente"
          message="Incidente finalizado correctamente"
          buttonLabel="Volver al Dashboard"
          onClose={() => navigate("/dashboard")}
        />
        <ErrorModal
          open={errorComplete !== null}
          title="No se pudo finalizar el incidente"
          message={errorComplete ?? "No se pudo finalizar el incidente"}
          onClose={() => setErrorComplete(null)}
        />
      </main>
    </AppLayout>
  );
};
