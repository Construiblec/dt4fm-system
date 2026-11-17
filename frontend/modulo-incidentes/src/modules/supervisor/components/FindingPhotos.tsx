import { useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, RotateCw, Trash2, X } from "lucide-react";
import type {
  LocalPhoto,
  SupervisionPhoto,
} from "@/modules/supervisor/types/Supervision";
import { PhotoLightbox } from "@/shared/components/PhotoLightbox";
import { TakePhotoButton } from "@/shared/components/TakePhotoButton";
import { buildAttachmentUrl } from "@/shared/utils/attachmentUrl";
import { MAX_FINDING_PHOTOS } from "@/modules/supervisor/utils/supervisionView";

/** Las mismas fotos con dos orígenes: lo único que cambia es cómo se nombran. */
const COPY = {
  finding: {
    alt: "Foto de la novedad",
    zoomed: "Foto de la novedad ampliada",
    plural: "fotos",
    empty: "Sin fotos",
  },
  fix: {
    alt: "Foto del arreglo",
    zoomed: "Foto del arreglo ampliada",
    plural: "fotos del arreglo",
    empty: "Sin fotos del arreglo",
  },
} as const;

type Props = {
  /** Fotos de la novedad (supervisor) o del arreglo (operario). */
  variant?: keyof typeof COPY;
  /** Fotos que openMAINT ya confirmó. */
  photos: SupervisionPhoto[];
  /** Elegidas en este dispositivo: subiendo o fallidas. */
  localPhotos?: LocalPhoto[];
  editable: boolean;
  /** Acción de la novedad en curso: no se puede tocar todavía. */
  disabled?: boolean;
  onAdd?: (files: File[]) => void;
  onDelete?: (photoId: string) => void;
  onRetry?: (photo: LocalPhoto) => void;
  onDiscard?: (photo: LocalPhoto) => void;
  onError?: (message: string) => void;
};

/** Fotos de una novedad (máximo 2). Solo pinta; las acciones vienen de fuera. */
export const FindingPhotos = ({
  variant = "finding",
  photos,
  localPhotos = [],
  editable,
  disabled = false,
  onAdd,
  onDelete,
  onRetry,
  onDiscard,
  onError,
}: Props) => {
  const copy = COPY[variant];
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const remaining = Math.max(
    0,
    MAX_FINDING_PHOTOS - photos.length - localPhotos.length,
  );

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (files.length > remaining) {
      onError?.(
        `Cada novedad admite ${MAX_FINDING_PHOTOS} ${copy.plural}. Te ${remaining === 1 ? "queda 1" : `quedan ${remaining}`}.`,
      );
      return;
    }
    onAdd?.(files);
  };

  if (!editable && photos.length === 0 && localPhotos.length === 0) {
    return <p className="text-xs text-slate-500">{copy.empty}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((photo) => {
          const url = buildAttachmentUrl(photo.downloadUrl);
          return (
            <div
              key={photo.id}
              className="relative h-16 w-16 overflow-hidden rounded-xl bg-slate-200"
            >
              <button
                type="button"
                onClick={() => setLightboxUrl(url)}
                className="h-full w-full"
                aria-label="Ampliar foto"
              >
                <img
                  src={url}
                  alt={copy.alt}
                  className="h-full w-full object-cover"
                />
              </button>
              {editable ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDelete?.(photo.id)}
                  aria-label="Borrar foto"
                  className="absolute right-0.5 top-0.5 rounded-full bg-slate-950/60 p-1 text-white transition hover:bg-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          );
        })}

        {localPhotos.map((photo) => (
          <div
            key={photo.localId}
            className="relative h-16 w-16 overflow-hidden rounded-xl bg-slate-200"
          >
            <img
              src={photo.previewUrl}
              alt="Foto por subir"
              className="h-full w-full object-cover opacity-60"
            />
            {photo.status === "uploading" ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <LoaderCircle
                  className="h-5 w-5 animate-spin text-slate-900"
                  aria-label="Subiendo"
                />
              </span>
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-red-950/60 p-0.5 text-center">
                <span className="text-[10px] font-bold leading-tight text-white">
                  No se subió
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onRetry?.(photo)}
                    aria-label="Reintentar foto"
                    className="rounded-full bg-white p-0.5 text-slate-900"
                  >
                    <RotateCw className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDiscard?.(photo)}
                    aria-label="Quitar foto"
                    className="rounded-full bg-white p-0.5 text-slate-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </span>
            )}
          </div>
        ))}

        {editable && remaining > 0 ? (
          <>
            <label
              className={`flex h-16 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-brand ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
            >
              <ImagePlus className="h-4 w-4" aria-hidden />
              Galería
              <input
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                multiple={remaining > 1}
                className="hidden"
                onChange={handleFiles}
                disabled={disabled}
              />
            </label>
            <TakePhotoButton
              className="h-16 border-dashed"
              onChange={handleFiles}
              disabled={disabled}
            />
          </>
        ) : null}
      </div>
      {editable ? (
        <p className="mt-1.5 text-xs text-slate-500">
          {photos.length + localPhotos.length}/{MAX_FINDING_PHOTOS}{" "}
          {copy.plural}
        </p>
      ) : null}

      <PhotoLightbox
        url={lightboxUrl}
        alt={copy.zoomed}
        onClose={() => setLightboxUrl(null)}
      />
    </div>
  );
};
