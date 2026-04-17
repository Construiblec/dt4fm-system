import { useState } from "react";
import { ImageOff, ZoomIn, X } from "lucide-react";
import { getAttachmentUrl } from "@/modules/supervisor/services/supervisorService";
import type { TaskAttachment } from "@/modules/supervisor/types/SupervisorTask";

type Props = {
  attachments: TaskAttachment[];
};

function formatUploadDate(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const TaskDetailPhotos = ({ attachments }: Props) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const photos = attachments.filter(
    (a) => a.category === "Photo" || a.category === "Image",
  );

  if (photos.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Evidencia fotográfica</h3>
        <div className="flex flex-col items-center gap-2 py-6 text-slate-300">
          <ImageOff className="h-8 w-8" />
          <p className="text-xs">Sin fotografías registradas</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Evidencia fotográfica</h3>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
            {photos.length} foto{photos.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => {
            const url = getAttachmentUrl(photo.downloadUrl);
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => setLightboxUrl(url)}
                className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
              >
                <img
                  src={url}
                  alt="Evidencia"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                  <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
                </div>
                <span className="absolute bottom-1 left-1 right-1 rounded-md bg-black/50 px-1 py-0.5 text-center text-[10px] text-white">
                  {formatUploadDate(photo.uploadDate)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Evidencia ampliada"
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};
