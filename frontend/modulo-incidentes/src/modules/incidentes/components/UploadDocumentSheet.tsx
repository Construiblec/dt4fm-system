import { Camera, FileUp, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Props = {
  open: boolean;
  /** Mientras esté deshabilitada solo se explica el flujo, no se sube nada */
  enabled: boolean;
  onCancel: () => void;
};

type OptionProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  disabled: boolean;
};

const UploadOption = ({
  icon: Icon,
  title,
  description,
  disabled,
}: OptionProps) => (
  <button
    type="button"
    disabled={disabled}
    className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10">
      <Icon className="h-4 w-4 text-brand" />
    </span>
    <span>
      <span className="block text-sm font-semibold text-slate-900">
        {title}
      </span>
      <span className="block text-xs text-slate-500">{description}</span>
    </span>
  </button>
);

export const UploadDocumentSheet = ({ open, enabled, onCancel }: Props) => {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white px-5 pb-6 pt-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />

        <h2 className="mt-4 text-base font-bold text-slate-900">
          Subir informe o documento
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          PDF, JPG o PNG · máximo 10 MB
        </p>

        {!enabled ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-xs text-blue-700">
              La subida de archivos aún no está habilitada.
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          <UploadOption
            icon={Camera}
            title="Tomar foto"
            description="Evidencia desde la cámara"
            disabled={!enabled}
          />
          <UploadOption
            icon={FileUp}
            title="Elegir archivo"
            description="Desde el dispositivo"
            disabled={!enabled}
          />
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};
