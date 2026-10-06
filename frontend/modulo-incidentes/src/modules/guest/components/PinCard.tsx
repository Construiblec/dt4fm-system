import { Building2, Clock, Info, KeyRound } from "lucide-react";
import type { GuestPortalData } from "../services/guestPortalService";
import {
  formatInstantDate,
  formatInstantDateTime,
  formatInstantTime,
} from "../utils/guestDates";
import { GuestCard, GuestSection } from "./GuestSection";

const PinDigits = ({ pin }: { pin: string }) => (
  <div
    className="grid grid-cols-4 gap-2"
    aria-label={`Tu PIN es ${pin.split("").join(" ")}`}
  >
    {pin.split("").map((digit, index) => (
      <div
        key={index}
        aria-hidden="true"
        className="flex h-[72px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-4xl font-bold tabular-nums text-slate-900 lg:h-20"
      >
        {digit}
      </div>
    ))}
  </div>
);

const EmptyDigits = () => (
  <div className="grid grid-cols-4 gap-2" aria-hidden="true">
    {[0, 1, 2, 3].map((index) => (
      <div
        key={index}
        className="flex h-[72px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white lg:h-20"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
      </div>
    ))}
  </div>
);

export const PinCard = ({ data }: { data: GuestPortalData }) => {
  if (data.pinState === "sin-cobertura") {
    return (
      <GuestSection icon={Building2} title="Acceso al edificio">
        <GuestCard className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
            <Info className="h-5 w-5 text-slate-500" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              Este edificio no usa PIN
            </p>
            <p className="text-sm text-slate-500">
              El ingreso {data.buildingName ? `a ${data.buildingName} ` : ""}
              no funciona con código. Coordina tu llegada con tu anfitrión.
            </p>
          </div>
        </GuestCard>
      </GuestSection>
    );
  }

  return (
    <GuestSection icon={KeyRound} title="Tu PIN de acceso">
      <GuestCard className="flex flex-col gap-4">
        {data.pinState === "disponible" && data.pin ? (
          <>
            <PinDigits pin={data.pin} />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                Márcalo en el teclado de la entrada del edificio.
              </p>
              <p className="text-xs text-slate-500">
                Funciona hasta el {formatInstantDateTime(data.accessValidTo)}.
              </p>
            </div>
            {data.syncState !== "synced" ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-700">
                  Tu PIN se está terminando de activar en la puerta. Si no
                  abre, inténtalo en unos minutos.
                </p>
              </div>
            ) : null}
          </>
        ) : data.pinState === "antes-del-checkin" ? (
          <>
            <EmptyDigits />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <Clock className="h-5 w-5 text-brand" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Tu PIN aparecerá aquí
                </p>
                <p className="text-sm text-slate-500">
                  El {formatInstantDate(data.accessValidFrom)} a las{" "}
                  {formatInstantTime(data.accessValidFrom)}, cuando empiece tu
                  acceso al edificio.
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Tu estadía terminó y el PIN ya no está activo.
          </p>
        )}
      </GuestCard>
    </GuestSection>
  );
};
