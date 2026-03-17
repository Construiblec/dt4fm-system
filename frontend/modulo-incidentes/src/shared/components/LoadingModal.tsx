type LoadingModalProps = {
  open: boolean;
};

export const LoadingModal = ({ open }: LoadingModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand" />
        <p className="mt-4 text-sm font-semibold text-slate-800">
          Creando incidente...
        </p>
      </div>
    </div>
  );
};
