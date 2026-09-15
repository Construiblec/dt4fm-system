import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ImagePlus, MapPin, X } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { SuccessModal } from "@/shared/components/SuccessModal";
import { GuestBackHeader } from "../components/GuestBackHeader";
import { GuestPageShell } from "../components/GuestPageShell";
import { GuestCard } from "../components/GuestSection";
import { GuestSkeleton } from "../components/GuestSkeleton";
import { GuestStateScreen } from "../components/GuestStateScreen";
import { useGuestPortal } from "../hooks/useGuestPortal";
import { useGuestToken } from "../hooks/useGuestToken";
import {
  createGuestIncident,
  getGuestApiErrorMessage,
} from "../services/guestPortalService";
import { downscaleImage } from "../utils/downscaleImage";

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

type Photo = { file: File; preview: string };

export const GuestIncidentPage = () => {
  const navigate = useNavigate();
  const { token } = useGuestToken();
  const portal = useGuestPortal(token);
  const fileInput = useRef<HTMLInputElement>(null);

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [incidentId, setIncidentId] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Las URLs de vista previa se liberan al salir de la página.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)),
    [],
  );

  if (!token) return <GuestStateScreen variant="missing" />;
  if (portal.isPending) return <GuestSkeleton />;
  if (portal.isError) {
    return (
      <GuestStateScreen
        variant="error"
        error={portal.error}
        onRetry={() => void portal.refetch()}
      />
    );
  }

  const data = portal.data;

  // Antes del check-in el reporte no existe, ni siquiera por URL directa.
  if (!data.canReportIncident && incidentId === null) {
    return <Navigate to="/guest/dashboard" replace />;
  }

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    const room = MAX_IMAGES - photos.length;

    if (selected.length > room) {
      setFormError(`Puedes adjuntar hasta ${MAX_IMAGES} fotos.`);
    } else {
      setFormError(null);
    }

    setPhotos((current) => [
      ...current,
      ...selected.slice(0, room).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  };

  const removePhoto = (index: number) => {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, i) => i !== index);
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!description.trim()) {
      setFormError("Cuéntanos qué está pasando.");
      return;
    }

    setFormError(null);
    setSending(true);

    try {
      const images = await Promise.all(
        photos.map((photo) => downscaleImage(photo.file)),
      );

      if (images.some((image) => image.size > MAX_IMAGE_BYTES)) {
        setFormError("Alguna foto supera los 5 MB. Prueba con otra.");
        return;
      }

      const result = await createGuestIncident(token, {
        description: description.trim(),
        location: location.trim() || undefined,
        images,
      });

      setIncidentId(result.incidentId);
    } catch (error) {
      setServerError(
        getGuestApiErrorMessage(
          error,
          "No pudimos enviar tu reporte. Inténtalo de nuevo en unos minutos.",
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const place = [
    data.unitName ? `Departamento ${data.unitName}` : null,
    data.buildingName ? `Edificio ${data.buildingName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <GuestPageShell width="narrow">
      <GuestBackHeader title="Reportar una incidencia" />

      <form onSubmit={submit} className="mt-5 flex flex-col gap-5" noValidate>
        {place ? (
          <div className="flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            {place}
          </div>
        ) : null}

        <GuestCard className="flex flex-col gap-5">
          <div className="space-y-2">
            <label
              htmlFor="guest-incident-description"
              className="text-sm font-medium text-slate-700"
            >
              ¿Qué está pasando?
            </label>
            <textarea
              id="guest-incident-description"
              rows={5}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Por ejemplo: no sale agua caliente en la ducha."
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="guest-incident-location"
              className="text-sm font-medium text-slate-700"
            >
              ¿Dónde? <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id="guest-incident-location"
              type="text"
              maxLength={120}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Baño principal, cocina, pasillo…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Fotos <span className="font-normal text-slate-400">(opcional, hasta {MAX_IMAGES})</span>
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <div
                  key={photo.preview}
                  className="relative aspect-square overflow-hidden rounded-xl bg-slate-100"
                >
                  <img
                    src={photo.preview}
                    alt={`Foto ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    aria-label={`Quitar foto ${index + 1}`}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_IMAGES ? (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs font-medium text-slate-500 transition hover:border-brand hover:text-brand"
                >
                  <ImagePlus className="h-5 w-5" />
                  Añadir
                </button>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              onChange={addPhotos}
              className="hidden"
            />
          </div>
        </GuestCard>

        {formError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-xl bg-brand py-4 text-base font-semibold text-white shadow-md transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          Enviar reporte
        </button>
      </form>

      <LoadingModal open={sending} message="Enviando tu reporte..." />
      <SuccessModal
        open={incidentId !== null}
        incidentId={incidentId}
        title="Reporte enviado"
        message="Nuestro equipo ya lo tiene y se pondrá en marcha."
        buttonLabel="Volver a mi portal"
        onClose={() => navigate("/guest/dashboard")}
      />
      <ErrorModal
        open={serverError !== null}
        title="No se pudo enviar el reporte"
        message={serverError ?? undefined}
        onClose={() => setServerError(null)}
      />
    </GuestPageShell>
  );
};
