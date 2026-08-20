import { useEffect, useState, type ChangeEvent } from "react";
import { Camera, LoaderCircle, Trash2, X, ZoomIn } from "lucide-react";
import { useTaskPhotos } from "@/modules/incidentes/hooks/useTaskPhotos";
import { getAttachmentUrl } from "@/modules/incidentes/services/cleaningTaskExecutionService";
import type { CleaningTaskAttachment } from "@/modules/incidentes/types/CleaningTaskExecution";

type CleaningTaskPhotoUploadProps = {
  taskId: number;
  /** Fotos ya subidas, tal como las devuelve el detalle de la tarea. */
  attachments: CleaningTaskAttachment[];
  onError: (message: string) => void;
};

/** Tope por tarea en el backend. */
const MAX_PHOTOS = 10;

const isPhoto = (attachment: CleaningTaskAttachment) =>
  attachment.category === "Photo" || attachment.category === "Image";

function formatUploadDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return isNaN(date.getTime())
    ? null
    : date.toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export const CleaningTaskPhotoUpload = ({
  taskId,
  attachments,
  onError,
}: CleaningTaskPhotoUploadProps) => {
  const { uploadMutation, deleteMutation } = useTaskPhotos(taskId);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<
    number | string | null
  >(null);

  const photos = attachments.filter(isPhoto);
  const isBusy = uploadMutation.isPending || deleteMutation.isPending;
  const remainingSlots = Math.max(0, MAX_PHOTOS - photos.length);

  useEffect(() => {
    const error = uploadMutation.error ?? deleteMutation.error;
    if (!error) return;

    onError(
      error instanceof Error
        ? error.message
        : "No se pudo actualizar la evidencia fotográfica",
    );
  }, [deleteMutation.error, onError, uploadMutation.error]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) return;

    if (files.length > remainingSlots) {
      onError(
        `Solo puedes tener ${MAX_PHOTOS} fotos por tarea. Te quedan ${remainingSlots}.`,
      );
      return;
    }

    uploadMutation.mutate(files);
  };

  return (
    <>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Fotografías de evidencia
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Opcional. Puedes subir varias y borrar las que no sirvan.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              photos.length > 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {photos.length > 0
              ? `${photos.length}/${MAX_PHOTOS}`
              : "Sin fotos"}
          </span>
        </div>

        {photos.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {photos.map((photo) => {
              const url = getAttachmentUrl(photo);
              const uploadedAt = formatUploadDate(photo.uploadDate);
              const isConfirmingDelete = pendingDeleteId === photo.id;

              return (
                <div
                  key={photo.id ?? url}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
                >
                  <button
                    type="button"
                    onClick={() => (url ? setLightboxUrl(url) : undefined)}
                    className="h-full w-full"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={photo.fileName ?? "Evidencia de limpieza"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <Camera className="h-6 w-6" />
                      </div>
                    )}
                    <ZoomIn className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
                  </button>

                  {uploadedAt && !isConfirmingDelete ? (
                    <span className="pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded-md bg-black/50 px-1 py-0.5 text-center text-[10px] text-white">
                      {uploadedAt}
                    </span>
                  ) : null}

                  {isConfirmingDelete ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-950/75 p-1 text-center">
                      <p className="text-[10px] font-semibold text-white">
                        ¿Borrar foto?
                      </p>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setPendingDeleteId(null);
                          if (photo.id != null) {
                            deleteMutation.mutate(photo.id);
                          }
                        }}
                        className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        Borrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="text-[10px] font-semibold text-white/80 underline"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setPendingDeleteId(photo.id ?? null)}
                      aria-label="Borrar fotografía"
                      className="absolute right-1 top-1 rounded-full bg-slate-950/60 p-1.5 text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <label
          className={`mt-4 block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center ${
            isBusy || remainingSlots === 0
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer"
          }`}
        >
          <div className="flex flex-col items-center justify-center py-4 text-slate-500">
            {uploadMutation.isPending ? (
              <>
                <LoaderCircle className="h-8 w-8 animate-spin text-cyan-600" />
                <p className="mt-3 text-sm font-semibold text-cyan-700">
                  Subiendo fotografías...
                </p>
              </>
            ) : (
              <>
                <Camera className="h-8 w-8" />
                <p className="mt-3 text-sm font-semibold">
                  {photos.length > 0 ? "Agregar más fotos" : "Seleccionar imágenes"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {remainingSlots === 0
                    ? `Llegaste al máximo de ${MAX_PHOTOS} fotos`
                    : "JPG, PNG o HEIC. Máximo 5MB cada una."}
                </p>
              </>
            )}
          </div>

          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={isBusy || remainingSlots === 0}
          />
        </label>

        {deleteMutation.isPending ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Borrando fotografía...
          </p>
        ) : null}
      </section>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Cerrar"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Evidencia ampliada"
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
};
