import { useRef } from "react";
import { FileUp, Info } from "lucide-react";

/** Extensiones que acepta el backend; las fotos van por la evidencia de cierre. */
const ACCEPTED_TYPES = ".pdf,.doc,.docx,.xls,.xlsx";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

type Props = {
  open: boolean;
  /** Mientras esté deshabilitada solo se explica el flujo, no se sube nada */
  enabled: boolean;
  isUploading: boolean;
  onSelect: (file: File) => void;
  onTooLarge: () => void;
  onCancel: () => void;
};

export const UploadDocumentSheet = ({
  open,
  enabled,
  isUploading,
  onSelect,
  onTooLarge,
  onCancel,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) {
    return null;
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    // Permite volver a elegir el mismo archivo tras un error
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      onTooLarge();
      return;
    }

    onSelect(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45"
      onClick={isUploading ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-6 pt-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />

        <h2 className="mt-4 text-base font-bold text-slate-900">
          Adjuntar documento
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          PDF, Word o Excel · máximo 10 MB
        </p>

        {!enabled ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-xs text-blue-700">
              La subida de archivos aún no está habilitada.
            </p>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleChange}
          className="hidden"
        />

        <button
          type="button"
          disabled={!enabled || isUploading}
          onClick={() => inputRef.current?.click()}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10">
            <FileUp className="h-4 w-4 text-brand" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              {isUploading ? "Subiendo documento..." : "Elegir archivo"}
            </span>
            <span className="block text-xs text-slate-500">
              Desde el dispositivo
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={isUploading}
          className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};
