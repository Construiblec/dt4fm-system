import { BottomSheet } from "@/shared/components/BottomSheet";

type Props = {
  /** Reserva directa: no hay conversación de Hostaway por la que avisar. */
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
          ? "Al huésped le llegará el PIN nuevo por mensaje de Hostaway."
          : "Es una reserva directa: al huésped no le llegará ningún mensaje con el PIN nuevo."}
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
