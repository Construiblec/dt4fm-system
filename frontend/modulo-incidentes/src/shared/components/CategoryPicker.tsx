import { Check, Sparkles, Tag, Wrench, type LucideIcon } from "lucide-react";
import type { MaintCategory } from "@/shared/services/categoriesService";

/** Icono y ayuda según el código de la categoría en OpenMaint. */
const LOOK: Record<string, { icon: LucideIcon; hint: string }> = {
  LIM: { icon: Sparkles, hint: "Suciedad, manchas, olores o basura" },
  MNT: { icon: Wrench, hint: "Daños, fallas o algo que reparar" },
};

const lookOf = (category: MaintCategory) => {
  const byCode = LOOK[category.code.toUpperCase()];
  if (byCode) return byCode;
  if (/limpi/i.test(category.name)) return LOOK.LIM;
  if (/manten/i.test(category.name)) return LOOK.MNT;
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

export const CategoryPicker = ({
  categories,
  value,
  onChange,
  variant = "cards",
  name = "category",
  invalid = false,
  labelledBy,
  describedBy,
}: Props) => (
  <div
    role="radiogroup"
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    aria-invalid={invalid || undefined}
    className="grid grid-cols-2 gap-2"
  >
    {categories.map((category) => {
      const { icon: Icon, hint } = lookOf(category);
      const checked = value === category.id;
      const input = (
        <input
          type="radio"
          name={name}
          value={category.id}
          checked={checked}
          onChange={() => onChange(category.id)}
          className="sr-only"
        />
      );

      if (variant === "compact") {
        return (
          <label
            key={category.id}
            className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-2.5 text-sm transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/25 ${
              checked
                ? "border-2 border-brand bg-blue-50 font-bold text-blue-900"
                : "border border-slate-300 bg-white font-medium text-slate-900 hover:border-slate-400"
            }`}
          >
            {input}
            <Icon
              className={`h-[18px] w-[18px] shrink-0 ${checked ? "text-blue-700" : "text-slate-600"}`}
              aria-hidden
            />
            {category.name}
          </label>
        );
      }

      return (
        <label
          key={category.id}
          className={`relative flex cursor-pointer flex-col items-start gap-2 rounded-2xl p-3.5 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/25 ${
            checked
              ? "border-2 border-brand bg-blue-50"
              : `border bg-white hover:border-slate-300 ${invalid ? "border-red-300" : "border-slate-200"}`
          }`}
        >
          {input}
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              checked ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span
            className={`text-[15px] font-semibold ${checked ? "text-blue-900" : "text-slate-900"}`}
          >
            {category.name}
          </span>
          {hint ? (
            <span
              className={`text-xs leading-snug ${checked ? "text-blue-700" : "text-slate-500"}`}
            >
              {hint}
            </span>
          ) : null}
          {checked ? (
            <span className="absolute right-3 top-3 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand text-white">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </span>
          ) : null}
        </label>
      );
    })}
  </div>
);
