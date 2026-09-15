import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

type ActionRowProps = {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tone: "brand" | "danger";
};

const TONES = {
  brand: "bg-brand/10 text-brand",
  danger: "bg-red-50 text-red-600",
};

export const ActionRow = ({
  to,
  icon: Icon,
  title,
  subtitle,
  tone,
}: ActionRowProps) => (
  <Link
    to={to}
    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
  >
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
    <ChevronRight className="h-[18px] w-[18px] shrink-0 text-slate-300" />
  </Link>
);
