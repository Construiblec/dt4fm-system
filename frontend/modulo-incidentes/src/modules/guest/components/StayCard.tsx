import { CalendarDays, DoorOpen, MapPin } from "lucide-react";
import type { GuestPortalData } from "../services/guestPortalService";
import {
  formatInstantDateTime,
  formatInstantTime,
  formatStayDate,
} from "../utils/guestDates";
import { GuestCard, GuestSection } from "./GuestSection";

const DateTile = ({
  label,
  date,
  time,
}: {
  label: string;
  date: string;
  time: string;
}) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2">
    <p className="text-[10px] text-slate-400">{label}</p>
    <p className="text-sm font-semibold text-slate-700">{date}</p>
    <p className="text-xs text-slate-500">{time}</p>
  </div>
);

export const StayCard = ({ data }: { data: GuestPortalData }) => (
  <GuestSection icon={CalendarDays} title="Tu estadía">
    <GuestCard className="flex flex-col gap-4">
      <div className="space-y-1">
        <p className="text-base font-semibold text-slate-900">
          {data.unitName ? `Departamento ${data.unitName}` : "Tu alojamiento"}
        </p>
        {data.buildingName ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <span>Edificio {data.buildingName}</span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DateTile
          label="Llegada"
          date={formatStayDate(data.arrivalDate)}
          time={`desde las ${formatInstantTime(data.checkInAt)}`}
        />
        <DateTile
          label="Salida"
          date={formatStayDate(data.departureDate)}
          time={`hasta las ${formatInstantTime(data.checkOutAt)}`}
        />
      </div>

      {data.pinState !== "sin-cobertura" ? (
        <div className="flex items-center gap-3 rounded-xl bg-brand/5 px-4 py-3">
          <DoorOpen className="h-5 w-5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-semibold text-brand">
              Acceso a la puerta
            </p>
            <p className="text-xs text-slate-500">
              {formatInstantDateTime(data.accessValidFrom)} —{" "}
              {formatInstantDateTime(data.accessValidTo)}
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-slate-400">Reserva {data.reservationId}</p>
    </GuestCard>
  </GuestSection>
);
