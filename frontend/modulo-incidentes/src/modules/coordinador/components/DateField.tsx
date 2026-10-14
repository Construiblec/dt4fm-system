import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { maskDmy, parseDmy, toDmy } from "../domain/dates";
import { cx, inputClass } from "./uiUtils";
import { FOCUS } from "./ui";

type Props = {
  id: string;
  /** YYYY-MM-DD, o vacío. */
  value: string;
  onChange: (ymd: string) => void;
  invalid?: boolean;
};

/**
 * Fecha en dd/mm/aaaa, siempre. El `<input type="date">` nativo la muestra en el
 * formato del idioma del navegador (mm/dd/aaaa en uno en inglés) y no hay forma
 * de cambiarlo, así que aquí se escribe en un texto y el calendario es el del
 * navegador, abierto desde el botón.
 */
export const DateField = ({ id, value, onChange, invalid }: Props) => {
  const pickerRef = useRef<HTMLInputElement>(null);
  // Lo que se está escribiendo; null = mostrar el valor.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? toDmy(value);
  const incomplete = draft !== null && parseDmy(draft) === null;

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.click();
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        autoComplete="off"
        className={inputClass(invalid || incomplete, "w-40 pr-10 tabular-nums")}
        value={text}
        onChange={(e) => {
          const masked = maskDmy(e.target.value);
          setDraft(masked);
          const ymd = parseDmy(masked);
          if (ymd) onChange(ymd);
        }}
        // Si quedó a medias, vuelve a la última fecha válida.
        onBlur={() => setDraft(null)}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Abrir calendario"
        className={cx(
          "absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 hover:text-brand",
          FOCUS,
        )}
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
      </button>
      {/* Solo para abrir el calendario del navegador; no se ve ni recibe foco. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        value={value}
        onChange={(e) => {
          if (!e.target.value) return;
          setDraft(null);
          onChange(e.target.value);
        }}
      />
    </div>
  );
};
