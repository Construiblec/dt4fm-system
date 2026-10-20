import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { PhotoLightbox } from "@/shared/components/PhotoLightbox";

type Props = {
  images: string[];
  /** Para el texto alternativo de cada foto */
  reference: string;
};

/** Fotos del reporte; tocar una la amplía. Sin fotos no se pinta. */
export const EvidenceGallery = ({ images, reference }: Props) => {
  const [selected, setSelected] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-slate-500" aria-hidden />
          <h2 className="text-base font-semibold text-slate-900">Evidencia</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {images.length === 1 ? "1 foto" : `${images.length} fotos`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {images.map((image, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setSelected(image)}
            aria-label={`Ampliar foto ${index + 1}`}
            className="overflow-hidden rounded-2xl bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
          >
            <img
              src={image}
              alt={`Evidencia ${index + 1} de ${reference}`}
              loading="lazy"
              className="h-32 w-full object-cover"
            />
          </button>
        ))}
      </div>

      <PhotoLightbox url={selected} onClose={() => setSelected(null)} />
    </section>
  );
};
