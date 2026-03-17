type VisitorInfoModalProps = {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
};

export const VisitorInfoModal = ({
  open,
  onClose,
  onAccept,
}: VisitorInfoModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="space-y-3 text-center">
          <h2 className="text-lg font-bold text-slate-900">Acceso visitante</h2>
          <p className="text-sm leading-6 text-slate-500">
            Para ingresar una novedad como visitante necesitamos sus datos para
            dar seguimiento.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};
