import type { ReactNode } from "react";
import { X } from "lucide-react";

type BottomSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Hoja inferior. Extrae el patrón que estaba copiado en `IosInstallSheet` y
 * `UploadDocumentSheet`: fondo oscuro que cierra al tocar, panel anclado abajo
 * con el mismo ancho móvil del resto de la app y el "grabber" de arrastre.
 */
export const BottomSheet = ({
  open,
  title,
  onClose,
  children,
}: BottomSheetProps) => {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />

        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-slate-400 transition hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
};
