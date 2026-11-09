import { BottomSheet } from "@/shared/components/BottomSheet";

type Props = {
  /** `false` en reservas directas: el PIN no se publica en Hostaway. */
  noticeByHostaway: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export const RenewPinSheet = ({
  noticeByHostaway,
  onConfirm,
  onClose,
}: Props) => (
  <BottomSheet open title="Renovar PIN" onClose={onClose}>
    <div className="space-y-3 px-5">
      <p className="-mt-1 text-sm text-slate-600">
        Se generará un PIN nuevo y el actual dejará de abrir las puertas.
      </p>

      <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
        {noticeByHostaway
          ? "El PIN nuevo se guardará en la reserva de Hostaway y al huésped le llegará un mensaje con el nuevo código."
          : "Es una reserva directa: el PIN nuevo no se guarda en Hostaway ni se le envía al huésped."}
      </p>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          Renovar PIN
        </button>
      </div>
    </div>
  </BottomSheet>
);
