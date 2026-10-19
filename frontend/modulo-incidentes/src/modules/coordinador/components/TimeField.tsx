import { useState } from "react";
import { maskHm, parseHm } from "../domain/dates";
import { inputClass } from "./uiUtils";

type Props = {
  id: string;
  /** HH:MM en 24 h, o vacío. */
  value: string;
  onChange: (hm: string) => void;
  invalid?: boolean;
  /** Para cuando no hay una etiqueta visible que apunte al campo. */
  ariaLabel?: string;
};

/**
 * Hora en hh:mm de 24 h, siempre. El `<input type="time">` nativo usa el reloj
 * del idioma del navegador (12 h con a. m./p. m. en español de Ecuador), así
 * que aquí se escribe en un texto: `1430` → `14:30`, `8` → `08`.
 */
export const TimeField = ({ id, value, onChange, invalid, ariaLabel }: Props) => {
  // Lo que se está escribiendo; null = mostrar el valor.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const incomplete = Boolean(draft) && parseHm(draft ?? "") === null;

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="numeric"
      placeholder="hh:mm"
      maxLength={5}
      autoComplete="off"
      className={inputClass(invalid || incomplete, "w-full tabular-nums")}
      value={text}
      onChange={(e) => {
        const masked = maskHm(e.target.value);
        setDraft(masked);
        // Vaciarlo también vale: en una pendiente el horario es opcional.
        if (!masked) {
          onChange("");
          return;
        }
        const hm = parseHm(masked);
        if (hm) onChange(hm);
      }}
      onBlur={() => {
        // Solo la hora ("14") se toma en punto; lo demás a medias vuelve al
        // último valor válido.
        const onTheHour = draft && /^\d{2}$/.test(draft) ? parseHm(`${draft}:00`) : null;
        if (onTheHour) onChange(onTheHour);
        setDraft(null);
      }}
    />
  );
};
