type ErrorModalProps = {
  open: boolean;
  message?: string;
  onClose: () => void;
  title?: string;
};

export const ErrorModal = ({
  open,
  message = "Intente nuevamente.",
  onClose,
  title = "No se pudo crear el incidente.",
}: ErrorModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <span className="text-xl font-bold">!</span>
        </div>

        <div className="mt-4 space-y-2 text-center">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{message}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};
