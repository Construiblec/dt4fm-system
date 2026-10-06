import { useState, type ChangeEvent } from "react";
import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { ImageOff, ImagePlus, LoaderCircle, Trash2, ZoomIn } from "lucide-react";
import { photoUploadSchema } from "@/modules/incidentes/schemas/cleaningTaskExecutionSchema";
import {
  deleteSupervisionEvidence,
  uploadSupervisionEvidence,
} from "@/modules/supervisor/services/supervisorService";
import type { TaskAttachment } from "@/modules/supervisor/types/SupervisorTask";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { PhotoLightbox } from "@/shared/components/PhotoLightbox";
import { TakePhotoButton } from "@/shared/components/TakePhotoButton";
import { buildAttachmentUrl } from "@/shared/utils/attachmentUrl";
import { downscaleImage } from "@/shared/utils/downscaleImage";
import { formatDayMonthTime } from "@/shared/utils/dateUtils";

type Props = {
  taskId: number;
  /** Todos los adjuntos de la tarea; aquí se quedan solo los de supervisión. */
  attachments: TaskAttachment[];
  /** Si se puede añadir y borrar. Fuera de esas fases la evidencia solo se ve. */
  editable: boolean;
  /** Tras subir o borrar: la lista vive en OpenMAINT y hay que volver a leerla. */
  onChanged: () => void;
};

/** Tope por tarea en el backend, aparte del de las fotos del operario. */
const MAX_EVIDENCE = 10;

/**
 * El backend responde en español a lo propio de esta evidencia (fase, tope);
 * el resto se resume en un mensaje genérico.
 */
const describeError = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    return error.response?.status === 400 && typeof message === "string"
      ? message
      : fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

/**
 * Novedades que el supervisor documenta con fotos al revisar una tarea. Si la
 * reabre, el equipo de limpieza las ve en su pantalla de ejecución.
 */
export const SupervisionEvidenceSection = ({
  taskId,
  attachments,
  editable,
  onChanged,
}: Props) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const evidence = attachments.filter((a) => a.origin === "supervision");
  const remainingSlots = Math.max(0, MAX_EVIDENCE - evidence.length);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      // De una en una: el backend valida el tope en cada subida, y en paralelo
      // dos peticiones podrían pasarlo a la vez.
      for (const original of files) {
        // Antes de validar: una foto de cámara de un móvil actual pasa de los
        // 5 MB; reducida a 1920 px queda en unos cientos de KB.
        const file = await downscaleImage(original);
        const parsed = photoUploadSchema.safeParse({ file });

        if (!parsed.success) {
          throw new Error(
            parsed.error.issues[0]?.message ?? "No se pudo validar la imagen",
          );
        }

        await uploadSupervisionEvidence(taskId, file);
      }
    },
    onError: (error) =>
      setErrorMessage(describeError(error, "No se pudo subir la evidencia.")),
    onSettled: onChanged,
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      deleteSupervisionEvidence(taskId, attachmentId),
    onError: (error) =>
      setErrorMessage(describeError(error, "No se pudo borrar la evidencia.")),
    onSettled: onChanged,
  });

  const isBusy = uploadMutation.isPending || deleteMutation.isPending;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) return;

    if (files.length > remainingSlots) {
      setErrorMessage(
        `Solo puedes tener ${MAX_EVIDENCE} fotos de evidencia por tarea. Te quedan ${remainingSlots}.`,
      );
      return;
    }

    uploadMutation.mutate(files);
  };

  return (
    <>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Evidencia Fotográfica de supervisor
            </h3>
            {editable ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Fotos de las novedades que encuentres. Si reabres la tarea, el
                equipo de limpieza las verá.
              </p>
            ) : null}
          </div>
          {evidence.length > 0 ? (
            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              {evidence.length}/{MAX_EVIDENCE}
            </span>
          ) : null}
        </div>

        {evidence.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {evidence.map((photo) => {
              const url = buildAttachmentUrl(photo.downloadUrl);
              const isConfirmingDelete = pendingDeleteId === photo.id;

              return (
                <div
                  key={photo.id}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(url)}
                    className="h-full w-full"
                  >
                    <img
                      src={url}
                      alt="Evidencia de supervisión"
                      className="h-full w-full object-cover"
                    />
                    <ZoomIn className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
                  </button>

                  {!isConfirmingDelete ? (
                    <span className="pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded-md bg-black/50 px-1 py-0.5 text-center text-[10px] text-white">
                      {formatDayMonthTime(photo.uploadDate)}
                    </span>
                  ) : null}

                  {editable && isConfirmingDelete ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-950/75 p-1 text-center">
                      <p className="text-[10px] font-semibold text-white">
                        ¿Borrar foto?
                      </p>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setPendingDeleteId(null);
                          deleteMutation.mutate(photo.id);
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
                  ) : null}

                  {editable && !isConfirmingDelete ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setPendingDeleteId(photo.id)}
                      aria-label="Borrar evidencia"
                      className="absolute right-1 top-1 rounded-full bg-slate-950/60 p-1.5 text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {evidence.length === 0 && !editable ? (
          <div className="flex flex-col items-center gap-2 py-6 text-slate-300">
            <ImageOff className="h-8 w-8" />
            <p className="text-xs">Sin evidencia de supervisión</p>
          </div>
        ) : null}

        {editable ? (
          <label
            className={`mt-3 block rounded-xl border border-dashed border-violet-300 bg-violet-50/50 p-4 text-center ${
              isBusy || remainingSlots === 0
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer"
            }`}
          >
            <div className="flex flex-col items-center justify-center text-violet-700">
              {uploadMutation.isPending ? (
                <>
                  <LoaderCircle className="h-6 w-6 animate-spin" />
                  <p className="mt-2 text-sm font-semibold">
                    Subiendo evidencia...
                  </p>
                </>
              ) : deleteMutation.isPending ? (
                <>
                  <LoaderCircle className="h-6 w-6 animate-spin" />
                  <p className="mt-2 text-sm font-semibold">
                    Borrando evidencia...
                  </p>
                </>
              ) : (
                <>
                  <ImagePlus className="h-6 w-6" />
                  <p className="mt-2 text-sm font-semibold">
                    {evidence.length > 0
                      ? "Agregar más desde la galería"
                      : "Elegir de la galería"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {remainingSlots === 0
                      ? `Llegaste al máximo de ${MAX_EVIDENCE} fotos`
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
        ) : null}

        {editable ? (
          <TakePhotoButton
            className="mt-3"
            onChange={handleFileChange}
            disabled={isBusy || remainingSlots === 0}
          />
        ) : null}
      </section>

      <PhotoLightbox
        url={lightboxUrl}
        alt="Evidencia de supervisión ampliada"
        onClose={() => setLightboxUrl(null)}
      />
      <ErrorModal
        open={errorMessage !== null}
        title="Evidencia Fotográfica de supervisor"
        message={errorMessage ?? ""}
        onClose={() => setErrorMessage(null)}
      />
    </>
  );
};
