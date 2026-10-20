import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Equal,
  type LucideIcon,
} from "lucide-react";
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
};

export const PrioritySelector = ({
  value,
  onChange,
  name = "priority",
}: Props) => (
  <fieldset>
    <legend className="mb-1.5 text-sm font-bold text-slate-900">
      Prioridad{" "}
      <span className="font-normal text-slate-600">(obligatorio)</span>
    </legend>
    <div className="grid grid-cols-2 gap-2">
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
  </fieldset>
);
