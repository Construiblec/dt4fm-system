import { formInputClass } from "@/modules/supervisor-mantenimiento/constants/formStyles";
import { DateField } from "@/shared/components/DateField";
import { nowTime, todayIso } from "@/shared/utils/plannedStart";

type Props = {
  id: string;
  fecha: string;
  hora: string;
  onFecha: (value: string) => void;
  onHora: (value: string) => void;
};

/** Fecha y hora de inicio previsto, con el mismo alto y borde; nada anterior a hoy. */
export const PlannedStartInputs = ({
  id,
  fecha,
  hora,
  onFecha,
  onHora,
}: Props) => {
  const today = todayIso();

  return (
    <div className="grid grid-cols-2 gap-2">
      <DateField
        id={id}
        value={fecha}
        onChange={onFecha}
        min={today}
        className={`${formInputClass} pl-3.5`}
      />
      <input
        type="time"
        aria-label="Hora de inicio previsto"
        value={hora}
        min={fecha === today ? nowTime() : undefined}
        onChange={(event) => onHora(event.target.value)}
        className={`${formInputClass} [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60`}
      />
    </div>
  );
};
