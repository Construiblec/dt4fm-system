import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Lock } from "lucide-react";
import {
  PRIORITY_DOT_CLASSES,
  PRIORITY_PHRASES,
  type PriorityCode,
} from "@/shared/constants/priority";
import {
  LATE_START_STYLE,
  OVERDUE_STYLE,
} from "@/shared/constants/statusPalette";
import type { WorkCardField } from "@/shared/utils/workCardFields";

type Notice = {
  /** `late`: no arrancó a tiempo; `overdue`: pasó su fecha límite */
  tone: "late" | "overdue";
  text: string;
};

const NOTICE_BADGE: Record<Notice["tone"], string> = {
  late: LATE_START_STYLE.badge,
  overdue: OVERDUE_STYLE.badge,
};

export const PriorityPill = ({ code }: { code: PriorityCode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-[3px] pl-2 pr-[9px] text-xs font-medium leading-[1.4] text-slate-700">
    <span
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT_CLASSES[code]}`}
    />
    {PRIORITY_PHRASES[code]}
  </span>
);

type Props = {
  number: string;
  statusLabel: string;
  /** Clases de la píldora de estado (`pillClass`) */
  statusPill: string;
  /** Barra lateral, ya resuelta por quien conoce el estado y el atraso */
  bar: string;
  title: string;
  notice?: Notice | null;
  fields: WorkCardField[];
  footerStart?: ReactNode;
  /** Ruta del detalle */
  to?: string;
  /** Alternativa a `to` cuando abrir exige lógica antes de navegar */
  onOpen?: () => void;
  disabledReason?: string | null;
  actionLabel?: string;
};

/** Armazón de las tarjetas de trabajo (diseño H): el título se estira sobre la tarjeta y es su nombre accesible. */
export const WorkCard = ({
  number,
  statusLabel,
  statusPill,
  bar,
  title,
  notice = null,
  fields,
  footerStart,
  to,
  onOpen,
  disabledReason = null,
  actionLabel = "Ver detalle",
}: Props) => {
  const canOpen = Boolean(to ?? onOpen) && !disabledReason;
  const stretched = "outline-none after:absolute after:inset-0 after:content-['']";

  return (
    <article
      className={`relative overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm ${
        canOpen
          ? "transition hover:border-slate-400 hover:shadow-md active:border-slate-400 active:bg-slate-50 active:shadow-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 has-[:focus-visible]:ring-offset-2 motion-reduce:transition-none"
          : ""
      }`}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${bar}`}
      />

      <div className="space-y-2.5 py-3 pl-[18px] pr-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold leading-[1.4] tracking-[0.4px] text-slate-600">
            {number}
          </p>
          <span className={`shrink-0 leading-[1.4] ${statusPill} !px-2.5`}>
            <span className="sr-only">Estado: </span>
            {statusLabel}
          </span>
        </div>

        <h3 className="break-words text-[15px] font-semibold leading-[1.3] text-slate-900">
          {canOpen && to ? (
            <Link to={to} className={stretched}>
              {title}
            </Link>
          ) : canOpen ? (
            <button type="button" onClick={onOpen} className={`text-left ${stretched}`}>
              {title}
            </button>
          ) : (
            title
          )}
        </h3>

        {notice ? (
          <p
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-[1.4] ${NOTICE_BADGE[notice.tone]}`}
          >
            <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
            {notice.text}
          </p>
        ) : null}

        <dl className="space-y-[7px] rounded-lg bg-slate-50 px-2.5 py-2.5">
          {fields.map(({ icon: Icon, label, value, dateTime }) => (
            <div key={label} className="flex items-start gap-2">
              <Icon
                aria-hidden
                className="mt-[3px] h-3.5 w-3.5 shrink-0 text-slate-500"
              />
              <dt className="w-[84px] shrink-0 pt-px text-xs leading-[1.4] text-slate-600">
                {label}
              </dt>
              <dd className="min-w-0 flex-1 break-words text-sm font-medium leading-[1.4] text-slate-900">
                {dateTime ? <time dateTime={dateTime}>{value}</time> : value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-between gap-2">
          {footerStart ?? <span />}

          {canOpen ? (
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-0.5 text-xs font-semibold leading-[1.4] text-blue-600"
            >
              {actionLabel}
              <ChevronRight className="h-4 w-4" />
            </span>
          ) : disabledReason ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-[3px] pl-2 pr-[9px] text-xs font-medium leading-[1.4] text-slate-600">
              <Lock
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-slate-500"
              />
              {disabledReason}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
};
