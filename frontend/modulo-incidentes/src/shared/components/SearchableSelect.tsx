import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Texto secundario, tambien considerado al filtrar */
  hint?: string;
  /** Titulo del grupo; se renderiza cuando cambia respecto a la opcion anterior */
  group?: string;
};

export type SearchableSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingMessage?: string;
  invalid?: boolean;
  required?: boolean;
  describedById?: string;
  onBlur?: () => void;
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export const SearchableSelect = ({
  id,
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Sin resultados",
  disabled = false,
  loading = false,
  loadingMessage = "Cargando...",
  invalid = false,
  required = false,
  describedById,
  onBlur,
}: SearchableSelectProps) => {
  const listboxId = `${useId()}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);

  const isDisabled = disabled || loading;

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const term = normalize(query.trim());

    if (!term) {
      return options;
    }

    return options.filter((option) =>
      normalize(`${option.label} ${option.hint ?? ""}`).includes(term),
    );
  }, [options, query]);

  const closePanel = useCallback(
    (focusTrigger: boolean) => {
      setOpen(false);
      setQuery("");

      if (focusTrigger) {
        triggerRef.current?.focus();
      }

      onBlur?.();
    },
    [onBlur],
  );

  const openPanel = () => {
    if (isDisabled) {
      return;
    }

    const selectedIndex = options.findIndex((option) => option.value === value);

    setQuery("");
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const select = (option: SearchableSelectOption) => {
    onChange(option.value);
    closePanel(true);
  };

  // El foco se pierde si se pide en el mismo tick que el commit de React
  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = requestAnimationFrame(() => searchRef.current?.focus());

    return () => cancelAnimationFrame(frame);
  }, [open]);

  // pointerdown (no click) para que en tactil no gane al onClick de la opcion
  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closePanel(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, closePanel]);

  const moveActive = (nextIndex: number) => {
    if (filtered.length === 0) {
      return;
    }

    const clamped = Math.min(Math.max(nextIndex, 0), filtered.length - 1);

    setActiveIndex(clamped);
    optionRefs.current[clamped]?.scrollIntoView({ block: "nearest" });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openPanel();
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveActive(0);
        break;
      case "End":
        event.preventDefault();
        moveActive(filtered.length - 1);
        break;
      case "Enter": {
        // Sin preventDefault el Enter enviaria el formulario que contiene el combobox
        event.preventDefault();

        const option = filtered[activeIndex];

        if (option) {
          select(option);
        }

        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closePanel(true);
        break;
      case "Tab":
        closePanel(false);
        break;
      default:
        break;
    }
  };

  const triggerClassName = [
    "flex w-full items-center justify-between gap-2 rounded-2xl border bg-white px-4 py-4 text-left text-sm outline-none transition focus:ring-4",
    invalid
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-slate-200 focus:border-brand focus:ring-brand/20",
    isDisabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : "text-slate-900",
  ].join(" ");

  const triggerLabel = loading
    ? loadingMessage
    : (selected?.label ?? placeholder);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        // Sin type="button" seria submit dentro del <form> y enviaria al desplegar
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedById}
        disabled={isDisabled}
        onClick={() => (open ? closePanel(false) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        className={triggerClassName}
      >
        <span
          className={`truncate ${
            selected && !loading ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {triggerLabel}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              autoComplete="off"
              role="searchbox"
              aria-controls={listboxId}
              aria-activedescendant={
                filtered[activeIndex]
                  ? `${listboxId}-option-${activeIndex}`
                  : undefined
              }
              value={query}
              placeholder={searchPlaceholder}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={id}
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                const showGroup =
                  Boolean(option.group) &&
                  option.group !== filtered[index - 1]?.group;

                return (
                  <Fragment key={option.value}>
                    {showGroup ? (
                      <li
                        role="presentation"
                        className="sticky top-0 bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
                      >
                        {option.group}
                      </li>
                    ) : null}

                    <li
                      ref={(element) => {
                        optionRefs.current[index] = element;
                      }}
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => select(option)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm ${
                        isSelected
                          ? "bg-brand/10 font-semibold text-brand"
                          : isActive
                            ? "bg-slate-100 text-slate-700"
                            : "text-slate-700"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{option.label}</span>
                        {option.hint ? (
                          <span className="block truncate text-xs text-slate-400">
                            {option.hint}
                          </span>
                        ) : null}
                      </span>

                      {isSelected ? (
                        <Check className="h-4 w-4 shrink-0" />
                      ) : null}
                    </li>
                  </Fragment>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
