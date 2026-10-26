import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Equal,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { PriorityGuideSheet } from "@/shared/components/PriorityGuide";
import {
  PRIORITY_ADJECTIVES,
  PRIORITY_ORDER,
  type PriorityCode,
} from "@/shared/constants/priority";

/** Color, icono y texto juntos: el color solo no basta para distinguirlas. */
const STYLES: Record<
  PriorityCode,
  { icon: LucideIcon; idle: string; checked: string }
> = {
  Low: {
    icon: ArrowDown,
    idle: "border-emerald-200 bg-emerald-50 text-emerald-800",
    checked: "border-emerald-700 bg-emerald-700 text-white",
  },
  Medium: {
    icon: Equal,
    idle: "border-amber-200 bg-amber-50 text-amber-800",
    checked: "border-amber-700 bg-amber-700 text-white",
  },
  High: {
    icon: ArrowUp,
    idle: "border-orange-200 bg-orange-50 text-orange-800",
    checked: "border-orange-700 bg-orange-700 text-white",
  },
  Critical: {
    icon: AlertTriangle,
    idle: "border-red-200 bg-red-50 text-red-800",
    checked: "border-red-700 bg-red-700 text-white",
  },
};

type Props = {
  value: PriorityCode | null;
  onChange: (value: PriorityCode) => void;
  name?: string;
  label?: string;
  /** Texto entre paréntesis junto a la leyenda; `null` para no mostrarlo. */
  note?: string | null;
  legendClassName?: string;
};

export const PrioritySelector = ({
  value,
  onChange,
  name = "priority",
  label = "Prioridad",
  note = "obligatorio",
  legendClassName = "text-sm font-bold text-slate-900",
}: Props) => {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <fieldset className="space-y-2">
      {/* Leyenda flotante: sigue siendo hija directa del fieldset y deja sitio al enlace. */}
      <legend className={`float-left ${legendClassName}`}>
        {label}
        {note ? (
          <span className="font-normal text-slate-600"> ({note})</span>
        ) : null}
      </legend>
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="float-right text-[13px] font-semibold text-brand hover:underline"
      >
        ¿Cómo elegir?
      </button>
      <div className="clear-both grid grid-cols-2 gap-2 pt-1.5">
        {[...PRIORITY_ORDER].reverse().map((option) => {
          const style = STYLES[option];
          const Icon = style.icon;
          const isChecked = value === option;

          return (
            <label
              key={option}
              className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3.5 text-[15px] font-bold transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-slate-900/20 ${
                isChecked ? style.checked : style.idle
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={isChecked}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex-1">{PRIORITY_ADJECTIVES[option]}</span>
              {isChecked ? (
                <Check className="h-[18px] w-[18px]" aria-hidden />
              ) : null}
            </label>
          );
        })}
      </div>
      <PriorityGuideSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </fieldset>
  );
};
