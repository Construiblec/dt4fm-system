import { useEffect, useRef, useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import { FOCUS } from "./ui";
import { cx } from "./uiUtils";

export type FilterOption<T extends string> = {
  value: T;
  label: string;
  /** Clase de color del punto que acompaña a la opción (p. ej. la del estado). */
  dotClass?: string;
};

type Props<T extends string> = {
  label: string;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
};

const ROW =
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50";
const CHECKBOX = "h-4 w-4 shrink-0 cursor-pointer accent-brand";

/**
 * Botón de filtro que abre una lista de casillas: "Todos" y una por opción,
 * sin cantidades. Se cierra al hacer clic fuera o con Escape.
 */
export const FilterMenu = <T extends string>({
  label,
  options,
  selected,
  onChange,
}: Props<T>) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chosen = options.filter((o) => selected.includes(o.value));
  const all = chosen.length === options.length;
  const summary = all
    ? ""
    : chosen.length === 0
      ? ": ninguno"
      : chosen.length === 1
        ? `: ${chosen[0].label}`
        : `: ${chosen.length} seleccionados`;

  // Se devuelven en el orden de las opciones, no en el de los clics.
  const toggle = (value: T) =>
    onChange(
      options
        .map((o) => o.value)
        .filter((v) => (v === value ? !selected.includes(v) : selected.includes(v))),
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition",
          FOCUS,
          all
            ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            : "border-brand/40 bg-brand/5 text-brand",
        )}
      >
        <Filter className="h-4 w-4" aria-hidden="true" />
        {label}
        {summary}
        <ChevronDown
          className={cx("h-4 w-4 transition", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 w-64 rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
          <fieldset>
            <legend className="sr-only">{label}</legend>
            <label className={cx(ROW, "font-semibold text-slate-900")}>
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={all}
                // A medias, "Todos" queda indeterminado; solo se puede poner desde JS.
                ref={(el) => {
                  if (el) el.indeterminate = !all && chosen.length > 0;
                }}
                onChange={() => onChange(all ? [] : options.map((o) => o.value))}
              />
              Todos
            </label>
            <div className="my-1 border-t border-slate-100" />
            {options.map((o) => (
              <label key={o.value} className={ROW}>
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                {o.dotClass ? (
                  <span
                    className={cx("h-2 w-2 shrink-0 rounded-full", o.dotClass)}
                    aria-hidden="true"
                  />
                ) : null}
                {o.label}
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}
    </div>
  );
};
