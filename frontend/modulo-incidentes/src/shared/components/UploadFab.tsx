import { Plus } from "lucide-react";

type Props = {
  onClick: () => void;
  label?: string;
};

/** Botón flotante «+» anclado abajo a la derecha de la columna móvil. */
export const UploadFab = ({ onClick, label = "Subir documento" }: Props) => (
  <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md justify-end px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
    >
      <Plus className="h-6 w-6" aria-hidden />
    </button>
  </div>
);
