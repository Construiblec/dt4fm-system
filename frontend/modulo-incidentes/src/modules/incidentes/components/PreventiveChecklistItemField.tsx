import type {
  ChecklistFieldKind,
  PreventiveChecklistItem,
} from "@/modules/incidentes/types/PreventiveChecklist";

type Props = {
  item: PreventiveChecklistItem;
  /** Valor tal como lo espera OpenMAINT, no el del input */
  value: string;
  onChange: (value: string) => void;
};

const FIELD_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * OpenMAINT guarda fechas y fecha-hora en ISO, pero los inputs nativos usan
 * `YYYY-MM-DD` y `YYYY-MM-DDTHH:mm` en hora local. Estas dos funciones son la
 * traducción entre ambos mundos.
 */
const toInputValue = (kind: ChecklistFieldKind, value: string): string => {
  if (!value || (kind !== "date" && kind !== "datetime")) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  return kind === "date"
    ? day
    : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toOutcomeValue = (kind: ChecklistFieldKind, input: string): string => {
  if (!input || (kind !== "date" && kind !== "datetime")) {
    return input;
  }

  // Se interpreta como hora local, que es lo que el técnico acaba de escribir
  const date = new Date(kind === "date" ? `${input}T00:00:00` : input);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const PreventiveChecklistItemField = ({
  item,
  value,
  onChange,
}: Props) => {
  const inputId = `checklist-item-${item.taskDefId}`;

  const handleInput = (next: string) =>
    onChange(toOutcomeValue(item.kind, next));

  if (item.options) {
    return (
      <select
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_CLASS}
      >
        <option value="">Selecciona una opción</option>
        {item.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const inputType = {
    date: "date",
    time: "time",
    datetime: "datetime-local",
    number: "number",
    text: "text",
  }[item.kind as "date" | "time" | "datetime" | "number" | "text"];

  const usesNativePicker =
    item.kind === "date" || item.kind === "time" || item.kind === "datetime";

  /**
   * Abre el calendario o el reloj del navegador al tocar el campo. Sin esto
   * hay que acertar con el iconito y, si no, el valor se teclea a mano.
   */
  const openNativePicker = (input: HTMLInputElement) => {
    if (!usesNativePicker || typeof input.showPicker !== "function") {
      return;
    }

    try {
      input.showPicker();
    } catch {
      // Algunos navegadores lo restringen; el input sigue siendo usable
    }
  };

  return (
    <input
      id={inputId}
      type={inputType ?? "text"}
      value={toInputValue(item.kind, value)}
      onChange={(event) => handleInput(event.target.value)}
      onClick={(event) => openNativePicker(event.currentTarget)}
      placeholder={item.kind === "text" ? "Escribe el resultado" : undefined}
      step={item.kind === "number" ? "any" : undefined}
      className={FIELD_CLASS}
    />
  );
};
