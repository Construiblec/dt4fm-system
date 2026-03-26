type SuccessModalProps = {
  open: boolean;
  incidentId: number | null;
  message: string;
  onClose: () => void;
  title?: string;
  buttonLabel?: string;
};

export const SuccessModal = ({
  open,
  incidentId,
  message,
  onClose,
  title = "Novedad reportada correctamente",
  buttonLabel = "Volver a pagina principal",
}: SuccessModalProps) => {
  if (!open || incidentId === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <span className="text-sm font-bold">OK</span>
        </div>

        <div className="mt-4 space-y-2 text-center">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">ID: {incidentId}</p>
          <p className="whitespace-pre-line text-sm text-slate-500">
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
};
