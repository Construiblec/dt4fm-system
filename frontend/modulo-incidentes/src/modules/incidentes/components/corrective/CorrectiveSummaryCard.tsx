import {
  CalendarDays,
  Flag,
  MapPin,
  Tag,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  PRIORITY_PILL_CLASSES,
  PRIORITY_PHRASES,
  toPriorityCode,
} from "@/shared/constants/priority";
import { PILL_SHAPE } from "@/shared/constants/statusPalette";
import { formatDayMonthYearTime } from "@/shared/utils/dateUtils";

export type SummaryExtraRow = {
  icon: LucideIcon;
  label: string;
  value: string;
};

type Props = {
  description: string | null;
  priority: string | null | undefined;
  /** Solo la categoría, o «Categoría · Otro» (ver `categoryLabel`). */
  category?: string | null;
  location: string | null;
  reporter: string | null;
  reportedAt: string | null;
  responsible?: string | null;
  extra?: SummaryExtraRow | null;
};

const Row = ({
  icon: Icon,
  label,
  value,
  accent = false,
}: SummaryExtraRow & { accent?: boolean }) => (
  <div className="flex items-start gap-3">
    <Icon
      className={`mt-0.5 h-5 w-5 shrink-0 ${accent ? "text-brand" : "text-slate-500"}`}
      aria-hidden
    />
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="text-[15px] font-semibold text-slate-900">{value}</p>
    </div>
  </div>
);

/** Lo más importante del correctivo, justo debajo del aviso. */
export const CorrectiveSummaryCard = ({
  description,
  priority,
  category,
  location,
  reporter,
  reportedAt,
  responsible,
  extra,
}: Props) => {
  const priorityCode = toPriorityCode(priority);

  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold leading-snug text-slate-900">
        {description || "Correctivo sin descripción"}
      </h2>

      <span
        className={`${PILL_SHAPE} inline-flex items-center gap-1 ring-1 ${
          priorityCode
            ? PRIORITY_PILL_CLASSES[priorityCode]
            : "bg-slate-50 text-slate-700 ring-slate-300"
        }`}
      >
        <Flag className="h-3.5 w-3.5" aria-hidden />
        {priorityCode
          ? PRIORITY_PHRASES[priorityCode]
          : "Prioridad por definir"}
      </span>

      <div className="space-y-3.5">
        {category ? (
          <Row icon={Tag} label="Categoría" value={category} />
        ) : null}
        <Row
          icon={MapPin}
          label="Ubicación"
          value={location ?? "Sin ubicación"}
        />
        {reporter ? (
          <Row icon={User} label="Reportado por" value={reporter} />
        ) : null}
        <Row
          icon={CalendarDays}
          label="Fecha de reporte"
          value={formatDayMonthYearTime(reportedAt)}
        />
        {responsible ? (
          <Row icon={Users} label="Responsable" value={responsible} />
        ) : null}
        {extra ? <Row {...extra} accent /> : null}
      </div>
    </section>
  );
};
