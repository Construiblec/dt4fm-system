import { Share, SquarePlus, X } from "lucide-react";

type IosInstallSheetProps = {
  open: boolean;
  onClose: () => void;
};

const steps = [
  { icon: Share, text: "Toca Compartir en la barra inferior de Safari." },
  { icon: SquarePlus, text: "Desliza y elige Añadir a pantalla de inicio." },
];

/** Safari no expone `beforeinstallprompt`: en iOS solo queda la guía manual. */
export const IosInstallSheet = ({ open, onClose }: IosInstallSheetProps) => {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Instalar en tu iPhone
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Tendrás Construiblec como una app más en tu pantalla de inicio.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-full p-1.5 text-slate-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mt-6 space-y-4">
          {steps.map(({ icon: Icon, text }, index) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
                {index + 1}
              </span>
              <Icon className="h-5 w-5 shrink-0 text-slate-400" />
              <p className="text-sm text-slate-700">{text}</p>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white"
        >
          Entendido
        </button>
      </div>
    </div>
  );
};
