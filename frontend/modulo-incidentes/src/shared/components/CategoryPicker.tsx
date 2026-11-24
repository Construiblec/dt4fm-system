import {
  CircleHelp,
  Sparkles,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { MaintCategory } from "@/shared/services/categoriesService";

/** Icono y ayuda según el código de la categoría en OpenMaint. */
const LOOK: Record<string, { icon: LucideIcon; hint: string }> = {
  LIM: { icon: Sparkles, hint: "Suciedad, manchas, olores o basura." },
  MNT: { icon: Wrench, hint: "Daños, fallas o algo que reparar." },
  OTR: { icon: CircleHelp, hint: "Lo que no es limpieza ni mantenimiento." },
};

const lookOf = (category: MaintCategory) => {
  const byCode = LOOK[category.code.toUpperCase()];
  if (byCode) return byCode;
  if (/limpi/i.test(category.name)) return LOOK.LIM;
  if (/manten/i.test(category.name)) return LOOK.MNT;
  if (/^otr/i.test(category.name)) return LOOK.OTR;
  return { icon: Tag, hint: "" };
};

type Props = {
  categories: MaintCategory[];
  value: number | null;
  onChange: (id: number) => void;
  /** `cards` en el formulario de reporte; `compact` al asignar. */
  variant?: "cards" | "compact";
  name?: string;
  invalid?: boolean;
  labelledBy?: string;
  describedBy?: string;
};

/** Categorías en una fila de tarjetas iguales; en el reporte, la ayuda de la elegida va debajo. */
export const CategoryPicker = ({
  categories,
  value,
  onChange,
  variant = "cards",
  name = "category",
  invalid = false,
  labelledBy,
  describedBy,
}: Props) => {
  const compact = variant === "compact";
  const selected = categories.find((category) => category.id === value);
  const hintId = `${name}-hint`;
  const selectedLook = selected ? lookOf(selected) : null;
  const SelectedIcon = selectedLook?.icon;

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={
          [describedBy, compact ? null : hintId].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={invalid || undefined}
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.max(categories.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {categories.map((category) => {
          const { icon: Icon } = lookOf(category);
          const checked = value === category.id;

          return (
            <label
              key={category.id}
              className={`flex cursor-pointer flex-col items-center justify-center text-center transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/25 ${
                compact
                  ? "min-h-16 gap-1.5 rounded-xl px-1 py-2.5"
                  : "gap-2 rounded-2xl px-1.5 pb-3 pt-3.5"
              } ${
                checked
                  ? "border-2 border-brand bg-blue-50"
                  : `border bg-white hover:border-slate-300 ${invalid ? "border-red-300" : "border-slate-200"}`
              }`}
            >
              <input
                type="radio"
                name={name}
                value={category.id}
                checked={checked}
                onChange={() => onChange(category.id)}
                className="sr-only"
              />
              {compact ? (
                <Icon
                  className={`h-[18px] w-[18px] ${checked ? "text-blue-700" : "text-slate-600"}`}
                  aria-hidden
                />
              ) : (
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    checked
                      ? "bg-brand text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
              )}
              <span
                className={`max-w-full font-semibold tracking-tight ${compact ? "text-xs" : "text-[13px]"} ${
                  checked ? "text-blue-900" : "text-slate-900"
                }`}
              >
                {category.name}
              </span>
            </label>
          );
        })}
      </div>
      {compact ? null : (
        <p
          id={hintId}
          className={`flex items-center gap-1.5 text-xs ${selected ? "text-blue-700" : "text-slate-500"}`}
        >
          {SelectedIcon ? (
            <SelectedIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
          {selected
            ? selectedLook?.hint || selected.name
            : "Elige la que mejor describa la novedad."}
        </p>
      )}
    </div>
  );
};
