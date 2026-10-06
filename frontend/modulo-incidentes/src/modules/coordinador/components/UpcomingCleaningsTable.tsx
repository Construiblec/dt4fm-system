import type { CheckoutItem } from "@/modules/coordinador/types/Coordinador";

type Props = {
  checkouts: CheckoutItem[];
  loading: boolean;
};

export const UpcomingCleaningsTable = ({ checkouts, loading }: Props) => {
  if (loading) {
    return (
      <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
        Cargando...
      </div>
    );
  }

  if (checkouts.length === 0) {
    return (
      <div className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
        Seleccioná un rango y pulsá "Buscar".
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
      {checkouts.map((checkout) => (
        <div
          key={checkout.reservationId}
          className="flex items-center justify-between px-4 py-3 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {checkout.listingName}
            </p>
            <p className="text-xs text-slate-400">{checkout.guestName}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold text-slate-700">{checkout.checkoutDate}</p>
            <p className="text-xs text-slate-400">{checkout.checkoutTime}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
