import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  daysInMonth,
  displayToIso,
  isoToDisplay,
  maskDate,
  mondayOffset,
  toIsoDate,
} from "@/shared/utils/dateTimeInput";

/**
 * Campo de fecha en **dd/mm/aaaa** con calendario propio.
 *
 * Existe porque `<input type="date">` y `<input type="datetime-local">` pintan
 * la fecha en el formato del **navegador**, no en el de la página: con Chrome
 * en inglés salía `mm/dd/yyyy`, y eso no se puede cambiar ni con `lang` ni con
 * CSS. La única forma de garantizar el orden día-mes-año conservando el
 * desplegable es dibujar el calendario a mano.
 *
 * El valor que entra y sale es siempre **`YYYY-MM-DD`** (o `""`), que es el
 * formato canónico con el que ya trabajan los helpers de fecha; lo de
 * `dd/mm/aaaa` es solo lo que ve el usuario.
 */

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Semana de lunes a domingo, como se lee aquí. */
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

type Props = {
  /** Fecha en `YYYY-MM-DD`, o `""` si no hay ninguna. */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
};

export const DateField = ({ value, onChange, id, className }: Props) => {
  const [texto, setTexto] = useState(() => isoToDisplay(value));
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // El valor puede cambiar desde fuera (al abrir el modal con una fecha ya
  // guardada, o al limpiarla); el texto visible tiene que seguirlo.
  useEffect(() => {
    setTexto(isoToDisplay(value));
  }, [value]);

  const [mesVisible, setMesVisible] = useState(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // Al abrir, el calendario aterriza en el mes de la fecha elegida.
  useEffect(() => {
    if (!abierto) return;

    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    setMesVisible({ year: base.getFullYear(), month: base.getMonth() });
  }, [abierto, value]);

  useEffect(() => {
    if (!abierto) return;

    const alPulsarFuera = (event: MouseEvent) => {
      if (!contenedor.current?.contains(event.target as Node)) {
        setAbierto(false);
      }
    };

    const alEscapar = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAbierto(false);
    };

    document.addEventListener("mousedown", alPulsarFuera);
    document.addEventListener("keydown", alEscapar);

    return () => {
      document.removeEventListener("mousedown", alPulsarFuera);
      document.removeEventListener("keydown", alEscapar);
    };
  }, [abierto]);

  const { year, month } = mesVisible;

  const celdas = useMemo(() => {
    const hueco = mondayOffset(year, month);
    const total = daysInMonth(year, month);

    return [
      ...Array.from({ length: hueco }, () => null),
      ...Array.from({ length: total }, (_, i) => i + 1),
    ];
  }, [year, month]);

  const hoyIso = useMemo(() => {
    const now = new Date();
    return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const moverMes = (delta: number) => {
    const fecha = new Date(year, month + delta, 1);
    setMesVisible({ year: fecha.getFullYear(), month: fecha.getMonth() });
  };

  const escribir = (raw: string) => {
    const masked = maskDate(raw);
    setTexto(masked);

    const iso = displayToIso(masked);
    // Solo se propaga cuando la fecha está completa y existe; mientras se
    // teclea, el padre conserva la anterior.
    if (iso || masked === "") onChange(iso);
  };

  const elegir = (day: number) => {
    onChange(toIsoDate(year, month, day));
    setAbierto(false);
  };

  const base =
    className ??
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/20";

  return (
    <div className="relative" ref={contenedor}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={texto}
        onChange={(event) => escribir(event.target.value)}
        onBlur={() => setTexto(isoToDisplay(value))}
        className={`${base} pr-10`}
      />

      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-label="Abrir calendario"
        aria-expanded={abierto}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <Calendar className="h-4 w-4" />
      </button>

      {abierto ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moverMes(-1)}
              aria-label="Mes anterior"
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="text-sm font-semibold text-slate-800">
              {MESES[month]} {year}
            </span>

            <button
              type="button"
              onClick={() => moverMes(1)}
              aria-label="Mes siguiente"
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {DIAS.map((dia, indice) => (
              <span
                key={`${dia}-${indice}`}
                className="py-1 text-[11px] font-semibold uppercase text-slate-400"
              >
                {dia}
              </span>
            ))}

            {celdas.map((day, indice) => {
              if (day === null) {
                return <span key={`hueco-${indice}`} />;
              }

              const iso = toIsoDate(year, month, day);
              const elegido = iso === value;
              const esHoy = iso === hoyIso;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => elegir(day)}
                  className={`rounded-md py-1.5 text-sm transition ${
                    elegido
                      ? "bg-brand font-semibold text-white"
                      : esHoy
                        ? "bg-slate-100 font-semibold text-slate-900"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
