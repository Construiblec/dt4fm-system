import type { Authorization } from "@/modules/supervisor-cav/types/Authorization";
import {
  accessDoorsView,
  type DoorState,
} from "@/modules/supervisor-cav/utils/accessDoors";
import { formatDayMonthYearTime } from "@/shared/utils/dateUtils";

type Props = {
  authorization: Authorization;
  onChange: () => void;
  onRetry: () => void;
  retrying: boolean;
};

const CHIP: Record<DoorState, { label: string; chip: string; dot: string }> = {
  active: {
    label: "Activo",
    chip: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  none: {
    label: "Sin acceso",
    chip: "bg-slate-100 text-slate-500",
    dot: "bg-slate-400",
  },
  activating: {
    label: "Activando…",
    chip: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  removing: {
    label: "Quitando…",
    chip: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  activateFailed: {
    label: "No se pudo activar",
    chip: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
  removeFailed: {
    label: "No se pudo quitar",
    chip: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
};

const NOTICE = {
  amber: {
    box: "border-amber-200 bg-amber-50",
    dot: "bg-amber-500",
    title: "text-amber-800",
    body: "text-amber-700",
  },
  red: {
    box: "border-red-200 bg-red-50",
    dot: "bg-red-500",
    title: "text-red-700",
    body: "text-red-700",
  },
};

/** «Nivel de acceso» con el estado de cada puerta: lo pedido frente a lo que confirmaron. */
export const AccessLevelCard = ({
  authorization,
  onChange,
  onRetry,
  retrying,
}: Props) => {
  const revoked = authorization.accessRevoked;
  const { doors, pendingNote, notice } = accessDoorsView(authorization);

  return (
    <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="space-y-0.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Nivel de acceso
        </p>
        {revoked ? (
          <>
            <p className="text-sm font-semibold text-red-700">
              Acceso revocado
            </p>
            <p className="text-xs text-slate-500">
              Revocado{revoked.by ? ` por ${revoked.by}` : ""} ·{" "}
              {formatDayMonthYearTime(revoked.at)}
            </p>
          </>
        ) : null}
      </div>

      {doors.length > 0 ? (
        <ul className="space-y-2 rounded-lg bg-slate-50 px-3 py-2.5">
          {doors.map((door) => {
            const chip = CHIP[door.state];
            return (
              <li
                key={door.scope}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm font-medium text-slate-700">
                  {door.label}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.chip}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
                  {chip.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {pendingNote ? (
        <p className="text-xs text-slate-500">{pendingNote}</p>
      ) : null}

      {notice ? (
        <div
          className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${NOTICE[notice.tone].box}`}
        >
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${NOTICE[notice.tone].dot}`}
          />
          <div className="space-y-0.5">
            <p
              className={`text-[13px] font-semibold ${NOTICE[notice.tone].title}`}
            >
              {notice.title}
            </p>
            <p className={`text-xs ${NOTICE[notice.tone].body}`}>
              {notice.body}
            </p>
            {notice.retry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="mt-1.5 rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retrying ? "Reintentando..." : "Reintentar"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onChange}
        className={
          revoked
            ? "w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
            : "w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        }
      >
        {revoked ? "Restaurar acceso" : "Cambiar nivel de accesos"}
      </button>
    </div>
  );
};
