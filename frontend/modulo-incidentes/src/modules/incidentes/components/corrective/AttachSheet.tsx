import { useRef, type ChangeEvent } from "react";
import { Camera, ChevronRight, FileText, Image } from "lucide-react";
import { BottomSheet } from "@/shared/components/BottomSheet";

const DOCUMENT_TYPES = ".pdf,.doc,.docx,.xls,.xlsx";

type Props = {
  open: boolean;
  isUploading: boolean;
  onSelect: (file: File) => void;
  onClose: () => void;
};

type Option = {
  label: string;
  hint: string;
  icon: typeof FileText;
  tone: string;
  accept: string;
  capture?: "environment";
};

const OPTIONS: Option[] = [
  {
    label: "Documento",
    hint: "PDF, Word o Excel · máximo 10 MB",
    icon: FileText,
    tone: "bg-red-50 text-red-700",
    accept: DOCUMENT_TYPES,
  },
  {
    label: "Foto de la galería",
    hint: "Elige una imagen guardada en el teléfono",
    icon: Image,
    tone: "bg-blue-50 text-blue-700",
    accept: "image/*",
  },
  {
    label: "Tomar foto",
    hint: "Abre la cámara",
    icon: Camera,
    tone: "bg-emerald-50 text-emerald-700",
    accept: "image/*",
    capture: "environment",
  },
];

/** Elige qué adjuntar: cada opción abre el gestor de archivos, la galería o la cámara. */
export const AttachSheet = ({
  open,
  isUploading,
  onSelect,
  onClose,
}: Props) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Permite volver a elegir el mismo archivo tras un error
    event.target.value = "";
    if (file) onSelect(file);
  };

  return (
    <BottomSheet
      open={open}
      title="Adjuntar a este correctivo"
      onClose={isUploading ? () => undefined : onClose}
    >
      <div className="space-y-2 px-5 pt-1">
        {OPTIONS.map((option, index) => {
          const Icon = option.icon;

          return (
            <div key={option.label}>
              <input
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                type="file"
                accept={option.accept}
                capture={option.capture}
                className="hidden"
                onChange={handleChange}
              />
              <button
                type="button"
                disabled={isUploading}
                onClick={() => inputs.current[index]?.click()}
                className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${option.tone}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-slate-900">
                    {option.label}
                  </span>
                  <span className="block text-sm text-slate-600">
                    {option.hint}
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-slate-500"
                  aria-hidden
                />
              </button>
            </div>
          );
        })}

        {isUploading ? (
          <p role="status" className="pt-1 text-center text-sm text-slate-600">
            Subiendo archivo...
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          disabled={isUploading}
          className="mt-2 min-h-12 w-full rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </BottomSheet>
  );
};
