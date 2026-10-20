import { AlertTriangle, Clock, Info, type LucideIcon } from "lucide-react";

export type ActionNoticeTone = "amber" | "indigo" | "blue" | "slate";

const TONES: Record<
  ActionNoticeTone,
  { box: string; title: string; text: string; icon: LucideIcon }
> = {
  amber: {
    box: "border-amber-300 bg-amber-50",
    title: "text-amber-800",
    text: "text-amber-900",
    icon: AlertTriangle,
  },
  indigo: {
    box: "border-indigo-200 bg-indigo-50",
    title: "text-indigo-800",
    text: "text-indigo-900",
    icon: Clock,
  },
  blue: {
    box: "border-blue-200 bg-blue-50",
    title: "text-blue-800",
    text: "text-blue-900",
    icon: Info,
  },
  slate: {
    box: "border-slate-200 bg-white",
    title: "text-slate-800",
    text: "text-slate-600",
    icon: Info,
  },
};

type Props = {
  tone: ActionNoticeTone;
  title: string;
  message?: string | null;
};

/** Aviso de lo que está pendiente; va arriba de todo y sin botones. */
export const ActionNotice = ({ tone, title, message }: Props) => {
  const style = TONES[tone];
  const Icon = style.icon;

  return (
    <section
      role="status"
      className={`flex items-start gap-3 rounded-3xl border p-4 ${style.box}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.title}`} aria-hidden />
      <div>
        <p className={`text-sm font-bold ${style.title}`}>{title}</p>
        {message ? (
          <p className={`mt-1 text-sm leading-relaxed ${style.text}`}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
};
