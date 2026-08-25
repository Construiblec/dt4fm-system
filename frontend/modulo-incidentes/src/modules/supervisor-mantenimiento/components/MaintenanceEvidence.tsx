import { useState } from "react";
import { ImageOff, X, ZoomIn } from "lucide-react";
import type { MaintenanceEvidence as Evidence } from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";

type Props = {
  images: Evidence[];
  loading?: boolean;
};

import { formatDayMonthTime } from "@/shared/utils/dateUtils";

const formatUploadDate = (iso: string | null) =>
  iso ? formatDayMonthTime(iso) : null;

/**
 * Evidencia fotográfica de un mantenimiento, en solo lectura.
 *
 * Las imágenes llegan del backend ya en base64 (`dataUrl`), así que se pintan
 * directamente: no hay descarga aparte ni hace falta que la sesión de OpenMAINT
 * llegue al navegador.
 */
export const MaintenanceEvidence = ({ images, loading = false }: Props) => {
  const [lightbox, setLightbox] = useState<Evidence | null>(null);

  return (
    <>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Evidencia fotográfica
          </h3>

          {!loading && images.length > 0 ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              {images.length} foto{images.length !== 1 ? "s" : ""}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="aspect-square animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-slate-300">
            <ImageOff className="h-8 w-8" />
            <p className="text-xs">Sin fotografías registradas</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((image) => {
              const uploadedAt = formatUploadDate(image.uploadDate);

              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setLightbox(image)}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100"
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name ?? "Evidencia"}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center transition group-hover:bg-black/20">
                    <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
                  </div>

                  {uploadedAt ? (
                    <span className="absolute bottom-1 left-1 right-1 truncate rounded-md bg-black/50 px-1 py-0.5 text-center text-[10px] text-white">
                      {uploadedAt}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          <img
            src={lightbox.dataUrl}
            alt={lightbox.name ?? "Evidencia ampliada"}
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
};
