import { X } from "lucide-react";

type PhotoLightboxProps = {
  /** Foto ampliada; con null no se pinta nada. */
  url: string | null;
  alt?: string;
  onClose: () => void;
};

/** Foto a pantalla completa; se cierra tocando fuera de la imagen o la X. */
export const PhotoLightbox = ({
  url,
  alt = "Evidencia ampliada",
  onClose,
}: PhotoLightboxProps) => {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={url}
        alt={alt}
        className="max-h-full max-w-full rounded-xl object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
};
