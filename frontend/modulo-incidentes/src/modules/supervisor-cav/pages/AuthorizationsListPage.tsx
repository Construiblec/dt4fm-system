import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { useAuthorizations } from "@/modules/supervisor-cav/hooks/useAuthorizations";
import { AppHeader } from "@/shared/components/AppHeader";
import { DateField } from "@/shared/components/DateField";
import { ListStateMessage } from "@/modules/incidentes/components/ListStateMessage";
import { badgeClass } from "@/shared/constants/statusPalette";
import { formatMediumDate } from "@/shared/utils/dateUtils";

const inputLabel =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export const AuthorizationsListPage = () => {
  const navigate = useNavigate();
  const { items, loading, error, from, to, applyDateRange } =
    useAuthorizations();

  // Borrador local: el rango se aplica al pulsar «Filtrar», no al teclear
  // cada fecha — cada consulta recorre Hostaway por varias páginas.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const rangoInvertido = Boolean(draftFrom) && Boolean(draftTo) && draftFrom > draftTo;
  const sinCambios = draftFrom === from && draftTo === to;

  return (
    <AppLayout className="bg-gray-100">
      <main className="flex min-h-screen flex-col bg-gray-100">
        <AppHeader />

        {/* La barra inferior es fija; el listado deja espacio debajo. */}
        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <h1 className="text-center text-2xl font-bold text-slate-900">
              Autorizaciones
            </h1>

            <div className="space-y-3 rounded-2xl bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="autDesde" className={inputLabel}>
                    Desde
                  </label>
                  <DateField
                    id="autDesde"
                    value={draftFrom}
                    onChange={setDraftFrom}
                  />
                </div>
                <div>
                  <label htmlFor="autHasta" className={inputLabel}>
                    Hasta
                  </label>
                  <DateField id="autHasta" value={draftTo} onChange={setDraftTo} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => applyDateRange(draftFrom, draftTo)}
                disabled={rangoInvertido || sinCambios}
                className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Filtrar
              </button>

              {rangoInvertido ? (
                <p className="text-xs font-medium text-amber-700">
                  La fecha de inicio es posterior a la de fin.
                </p>
              ) : null}
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                Próximos check-ins
              </h2>
              <span className="text-xs text-slate-400">Desde Hostaway</span>
            </div>

            <ListStateMessage
              loading={loading}
              error={error}
              isEmpty={!loading && !error && items.length === 0}
              hasNoMatches={false}
              loadingMessage="Cargando reservas..."
              emptyMessage="No hay check-ins próximos en este rango"
            />

            <div className="space-y-3">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900">
                        {item.guestName}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {item.unitLabel}
                      </p>
                    </div>

                    {item.pinStatus === "pending" ? (
                      <span className={`shrink-0 ${badgeClass("assigned")}`}>
                        Pendiente de enviar
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 shrink-0" />
                      <span>Check-in {formatMediumDate(item.checkIn)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 shrink-0" />
                      <span>Check-out {formatMediumDate(item.checkOut)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-slate-500">
                      Válido hasta {formatMediumDate(item.checkOut)}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/supervisor-cav/autorizaciones/${item.id}`)
                      }
                      className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
                    >
                      Ver
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </AppLayout>
  );
};
