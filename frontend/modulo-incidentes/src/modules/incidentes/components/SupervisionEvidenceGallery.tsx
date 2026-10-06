import { useState } from "react";
import { ClipboardList, ZoomIn } from "lucide-react";
import { getAttachmentUrl } from "@/modules/incidentes/services/cleaningTaskExecutionService";
import type { CleaningTaskAttachment } from "@/modules/incidentes/types/CleaningTaskExecution";
import { PhotoLightbox } from "@/shared/components/PhotoLightbox";
import { formatDayMonthTime } from "@/shared/utils/dateUtils";
import { cleanObservationText } from "@/shared/utils/textUtils";

type SupervisionEvidenceGalleryProps = {
  /** Todos los adjuntos de la tarea; aquí se quedan solo los de supervisión. */
  attachments: CleaningTaskAttachment[];
  /**
   * Observaciones de supervisión para mostrar junto a las fotos. Solo hace falta
   * donde la pantalla no las enseña ya, como antes de iniciar una tarea reabierta.
   */
  observations?: string | null;
};

/**
 * Lo que el supervisor encontró al revisar, en solo lectura. Le dice al operario
 * qué corregir cuando se le reabre una tarea.
 */
export const SupervisionEvidenceGallery = ({
  attachments,
  observations,
}: SupervisionEvidenceGalleryProps) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const evidence = attachments.filter((a) => a.origin === "supervision");

  if (evidence.length === 0) return null;

  return (
    <>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Evidencia Fotográfica de supervisor
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Novedades que encontró el supervisor al revisar la tarea.
            </p>
          </div>
        </div>

        {observations ? (
          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-3">
            <p className="mb-1 text-xs font-semibold text-violet-700">
              Observaciones de supervisión
            </p>
            <p className="whitespace-pre-line text-sm italic text-violet-900">
              "{cleanObservationText(observations)}"
            </p>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {evidence.map((photo) => {
            const url = getAttachmentUrl(photo);

            return (
              <button
                key={photo.id ?? url}
                type="button"
                onClick={() => (url ? setLightboxUrl(url) : undefined)}
                className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
              >
                {url ? (
                  <img
                    src={url}
                    alt="Evidencia de supervisión"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                <ZoomIn className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
                {photo.uploadDate ? (
                  <span className="pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded-md bg-black/50 px-1 py-0.5 text-center text-[10px] text-white">
                    {formatDayMonthTime(photo.uploadDate)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <PhotoLightbox
        url={lightboxUrl}
        alt="Evidencia de supervisión ampliada"
        onClose={() => setLightboxUrl(null)}
      />
    </>
  );
};
