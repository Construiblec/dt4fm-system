import { useEffect, useState } from "react";
import {
  Car,
  CircleAlert,
  CircleCheck,
  Clock,
  DoorOpen,
  Loader2,
  PowerOff,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { ListStateMessage } from "@/modules/incidentes/components/ListStateMessage";
import {
  useRemoteDoors,
  type DoorActionResult,
} from "@/modules/supervisor-cav/hooks/useRemoteDoors";
import {
  DOOR_SCOPE_LABELS,
  type Door,
  type DoorAction,
  type DoorLastCommand,
} from "@/modules/supervisor-cav/types/Door";
import { AppHeader } from "@/shared/components/AppHeader";
import { formatRelativeTime } from "@/shared/utils/dateUtils";

const OUTCOME_LABELS: Record<DoorLastCommand["outcome"], string> = {
  opened: "abierta",
  closed: "cerrada",
  failed: "falló",
  uncertain: "sin confirmar",
  attempted: "en curso",
};

const lastCommandText = (last: DoorLastCommand) =>
  `Última orden remota (${last.action === "open" ? "abrir" : "cerrar"}) ` +
  `${formatRelativeTime(last.at)} · ` +
  `${last.actorType === "guest" ? "huésped" : (last.actorUsername ?? "staff")} · ` +
  OUTCOME_LABELS[last.outcome];

const noticeFor = (result: DoorActionResult) => {
  switch (result.outcome) {
    case "opened":
      return {
        tone: "text-emerald-700 bg-emerald-50",
        Icon: CircleCheck,
        text: "Puerta abierta",
      };
    case "closed":
      return {
        tone: "text-emerald-700 bg-emerald-50",
        Icon: CircleCheck,
        text: "Puerta cerrada",
      };
    case "uncertain":
      return {
        tone: "text-amber-700 bg-amber-50",
        Icon: TriangleAlert,
        text: "No se pudo confirmar la orden. Verifica la puerta.",
      };
    case "failed":
      return {
        tone: "text-red-700 bg-red-50",
        Icon: CircleAlert,
        text: "La puerta no respondió.",
      };
    case "error":
      return {
        tone: "text-red-700 bg-red-50",
        Icon: CircleAlert,
        text: result.message,
      };
  }
};

const ResultNotice = ({ result }: { result: DoorActionResult }) => {
  const { tone, Icon, text } = noticeFor(result);

  return (
    <p
      role="status"
      className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tone}`}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" />
      {text}
    </p>
  );
};

const secondsUntil = (iso: string | null, now: number) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0;

const DoorRow = ({
  door,
  enabled,
  busy,
  pendingAction,
  now,
  result,
  onCommand,
}: {
  door: Door;
  enabled: boolean;
  busy: boolean;
  pendingAction: DoorAction | null;
  now: number;
  result?: DoorActionResult;
  onCommand: (action: DoorAction) => void;
}) => {
  const Icon = door.scope === "vehicular" ? Car : DoorOpen;
  const remaining = secondsUntil(door.openUntil, now);
  // Solo la barrera vehicular sigue arriba un rato; ese es el único caso de «Cerrar».
  const action: DoorAction = remaining > 0 ? "close" : "open";
  const label =
    pendingAction === "close"
      ? "Cerrando…"
      : pendingAction === "open"
        ? "Abriendo…"
        : action === "close"
          ? "Cerrar"
          : "Abrir";

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10">
          <Icon className="h-5 w-5 text-brand" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {DOOR_SCOPE_LABELS[door.scope]}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${door.online ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            {door.online ? "En línea" : "Sin conexión"} · {door.deviceId}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCommand(action)}
          disabled={!enabled || !door.online || busy}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 ${
            action === "close"
              ? "bg-slate-800 hover:bg-slate-700"
              : "bg-brand hover:bg-brand-hover"
          }`}
        >
          {pendingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {label}
        </button>
      </div>

      {remaining > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          Abierta · se cierra sola en {remaining} s
        </p>
      ) : null}

      {result ? <ResultNotice result={result} /> : null}

      {door.lastCommand ? (
        <p className="mt-2 text-[11px] text-slate-400">
          {lastCommandText(door.lastCommand)}
        </p>
      ) : null}
    </li>
  );
};

export const RemoteDoorsPage = () => {
  const { overview, loading, error, pending, results, command, reload } =
    useRemoteDoors();
  const buildings = overview?.buildings ?? [];
  const anyOpen = buildings.some((building) =>
    building.doors.some((door) => door.openUntil),
  );
  const [now, setNow] = useState(() => Date.now());

  // Cuenta regresiva de las barreras abiertas, sin volver a pedir la lista.
  useEffect(() => {
    if (!anyOpen) return;

    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [anyOpen]);

  return (
    <AppLayout className="bg-gray-100">
      <main className="flex min-h-screen flex-col bg-gray-100">
        <AppHeader />

        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <div className="relative">
              <h1 className="text-center text-2xl font-bold text-slate-900">
                Puertas
              </h1>
              <button
                type="button"
                onClick={() => void reload()}
                disabled={loading}
                aria-label="Actualizar"
                className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-500 transition hover:bg-white disabled:opacity-50"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {overview && !overview.enabled ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <PowerOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-700">
                  La apertura remota está desactivada. Las puertas siguen
                  funcionando con PIN.
                </p>
              </div>
            ) : null}

            <ListStateMessage
              loading={loading && !overview}
              error={error}
              isEmpty={!loading && !error && buildings.length === 0}
              hasNoMatches={false}
              loadingMessage="Cargando puertas..."
              emptyMessage="No hay puertas con control de acceso"
            />

            {buildings.map((building) => (
              <article
                key={building.buildingId}
                className="rounded-xl bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    {building.name}
                  </h2>
                  {!building.online ? (
                    <span className="text-xs font-medium text-amber-700">
                      Edificio sin conexión
                    </span>
                  ) : null}
                </div>

                <ul className="divide-y divide-slate-100">
                  {building.doors.map((door) => (
                    <DoorRow
                      key={door.deviceId}
                      door={door}
                      enabled={overview?.enabled ?? false}
                      busy={pending !== null}
                      pendingAction={
                        pending?.deviceId === door.deviceId
                          ? pending.action
                          : null
                      }
                      now={now}
                      result={results[door.deviceId]}
                      onCommand={(action) => void command(door.deviceId, action)}
                    />
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>
    </AppLayout>
  );
};
