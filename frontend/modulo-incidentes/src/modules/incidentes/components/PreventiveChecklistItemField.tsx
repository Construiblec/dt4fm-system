import { CalendarDays, Check, Clock, X } from "lucide-react";
import type {
  ChecklistFieldKind,
  ChecklistOption,
  PreventiveChecklistItem,
} from "@/modules/incidentes/types/PreventiveChecklist";
import { FLAG_LABELS } from "@/modules/incidentes/utils/checklistOutcome";

/**
 * `showPicker()` está en Chrome 99+ y Firefox 101+. Si no existe se deja el
 * campo con el comportamiento nativo del navegador en lugar de ofrecer un
 * botón que no haría nada.
 */
const SUPPORTS_SHOW_PICKER =
  typeof HTMLInputElement !== "undefined" &&
  typeof HTMLInputElement.prototype.showPicker === "function";

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

/** Tipos con dos opciones excluyentes, que se pintan como botones. */
type ChoiceKind = "posneg" | "flag";

const SELECTED_CLASS = [
  "border-emerald-600 bg-emerald-600 text-white",
  "border-red-600 bg-red-600 text-white",
];

type ChoiceProps = {
  kind: ChoiceKind;
  options: ChecklistOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
};

/** Dos opciones excluyentes como botones, en vez de un desplegable. */
const ChecklistChoice = ({
  kind,
  options,
  value,
  onChange,
  label,
}: ChoiceProps) => (
  <div role="group" aria-label={label} className="grid grid-cols-2 gap-2">
    {options.map((option, index) => {
      const isSelected = value === option.id;
      const Icon = index === 0 ? Check : X;

      return (
        <button
          key={option.id}
          type="button"
          aria-pressed={isSelected}
          // Volver a pulsar la opción marcada la deselecciona
          onClick={() => onChange(isSelected ? "" : option.id)}
          className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
            isSelected
              ? SELECTED_CLASS[index]
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {kind === "flag" ? (FLAG_LABELS[index] ?? option.label) : option.label}
        </button>
      );
    })}
  </div>
);

export const PreventiveChecklistItemField = ({
  item,
  value,
  onChange,
}: Props) => {
  const inputId = `checklist-item-${item.taskDefId}`;

  const handleInput = (next: string) =>
    onChange(toOutcomeValue(item.kind, next));

  if (item.options && (item.kind === "posneg" || item.kind === "flag")) {
    return (
      <ChecklistChoice
        kind={item.kind}
        options={item.options}
        value={value}
        onChange={onChange}
        label={item.label}
      />
    );
  }

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

  const showPickerButton = usesNativePicker && SUPPORTS_SHOW_PICKER;

  /**
   * Abre el calendario o el reloj del navegador.
   *
   * Va en un botón aparte y no en el `onClick` del campo a propósito: al
   * dispararlo en cada clic sobre el input, Firefox reabre el panel y roba el
   * foco, con lo que el valor deja de poder teclearse.
   */
  const openNativePicker = () => {
    const input = document.getElementById(inputId);

    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    try {
      input.showPicker();
    } catch {
      // Algunos navegadores lo restringen; el campo sigue siendo escribible
    }
  };

  const PickerIcon = item.kind === "time" ? Clock : CalendarDays;

  const input = (
    <input
      id={inputId}
      type={inputType ?? "text"}
      value={toInputValue(item.kind, value)}
      onChange={(event) => handleInput(event.target.value)}
      placeholder={item.kind === "text" ? "Escribe el resultado" : undefined}
      step={item.kind === "number" ? "any" : undefined}
      className={
        showPickerButton
          ? // Se oculta el icono nativo de Chrome para no duplicar el botón
            `${FIELD_CLASS} pr-11 [&::-webkit-calendar-picker-indicator]:hidden`
          : FIELD_CLASS
      }
    />
  );

  if (!showPickerButton) {
    return input;
  }

  return (
    <div className="relative">
      {input}

      <button
        type="button"
        onClick={openNativePicker}
        aria-label={
          item.kind === "time" ? "Abrir selector de hora" : "Abrir calendario"
        }
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <PickerIcon className="h-4 w-4" />
      </button>
    </div>
  );
};
