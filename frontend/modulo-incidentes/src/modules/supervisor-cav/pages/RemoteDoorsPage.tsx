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
import { BuildingSelect } from "@/modules/supervisor-cav/components/BuildingSelect";
import {
  useRemoteDoors,
  type DoorActionResult,
  type PendingCommand,
} from "@/modules/supervisor-cav/hooks/useRemoteDoors";
import {
  DOOR_SCOPE_LABELS,
  type Door,
  type DoorAction,
  type DoorLastCommand,
  type DoorPhase,
} from "@/modules/supervisor-cav/types/Door";
import { AppHeader } from "@/shared/components/AppHeader";
import { formatRelativeTime } from "@/shared/utils/dateUtils";

// La barrera no tiene sensor: los textos hablan de pulsos, nunca de posición.
const OUTCOME_LABELS: Record<DoorLastCommand["outcome"], string> = {
  triggered: "pulso enviado",
  opened: "pulso enviado",
  closed: "pulso enviado",
  failed: "no salió",
  uncertain: "sin confirmar",
  attempted: "en curso",
};

const lastCommandText = (last: DoorLastCommand) =>
  `Último pulso remoto (${last.action === "open" ? "abrir" : "cerrar"}) ` +
  `${formatRelativeTime(last.at)} · ` +
  `${last.actorType === "guest" ? "huésped" : (last.actorUsername ?? "staff")} · ` +
  OUTCOME_LABELS[last.outcome];

/** Motivo del `failed` según el código de la VPS; lo demás cae en el genérico. */
const FAILURE_MESSAGES: Record<string, string> = {
  device_unreachable: "El gateway no alcanzó la barrera.",
  gateway_unreachable: "El edificio no responde.",
  operations_disabled: "El edificio tiene apagado el control físico de la barrera.",
  device_not_compatible: "Esta puerta no admite apertura remota.",
  not_found: "Esta barrera aún no admite apertura remota.",
};

const noticeFor = (result: DoorActionResult) => {
  switch (result.outcome) {
    case "triggered":
      return {
        tone: "text-emerald-700 bg-emerald-50",
        Icon: CircleCheck,
        text:
          result.action === "close"
            ? "Orden de cierre enviada a la barrera"
            : "Orden enviada a la barrera",
      };
    case "resolved":
      return {
        tone: "text-emerald-700 bg-emerald-50",
        Icon: CircleCheck,
        text: "Barrera liberada: vuelve a admitir «Abrir»",
      };
    case "uncertain":
      return {
        tone: "text-amber-700 bg-amber-50",
        Icon: TriangleAlert,
        text: "No se pudo confirmar si el pulso salió. Revisa la barrera.",
      };
    case "failed":
      return {
        tone: "text-red-700 bg-red-50",
        Icon: CircleAlert,
        text:
          FAILURE_MESSAGES[result.errorCode ?? ""] ?? "La barrera no respondió.",
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

/** La fase llega al cargar la lista; los plazos la hacen avanzar sin volver a pedirla. */
const livePhase = (door: Door, now: number): DoorPhase | null => {
  if (door.phase !== "closable" && door.phase !== "settling") return door.phase;
  if (secondsUntil(door.openUntil, now) > 0) return "closable";
  if (secondsUntil(door.settlesAt, now) > 0) return "settling";

  return "ready";
};

const DoorRow = ({
  door,
  enabled,
  busy,
  pendingAction,
  now,
  result,
  cooldownUntil,
  onCommand,
  onResolve,
}: {
  door: Door;
  enabled: boolean;
  busy: boolean;
  pendingAction: PendingCommand["action"] | null;
  now: number;
  result?: DoorActionResult;
  /** Del pulso recién mandado desde aquí; la lista trae el de los demás. */
  cooldownUntil: string | null;
  onCommand: (action: DoorAction) => void;
  onResolve: () => void;
}) => {
  const Icon = door.scope === "vehicular" ? Car : DoorOpen;
  const phase = livePhase(door, now);
  const action: DoorAction = phase === "closable" ? "close" : "open";
  // Liberar una barrera no es un pulso: el enfriamiento no le aplica.
  const cooldown =
    phase === "uncertain"
      ? 0
      : Math.max(
          secondsUntil(door.cooldownUntil, now),
          secondsUntil(cooldownUntil, now),
        );
  const label = pendingAction
    ? "Enviando…"
    : phase === "uncertain"
      ? "Marcar revisada"
      : cooldown > 0
        ? `Espera ${cooldown} s`
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
          <p className="truncate text-sm font-semibold text-slate-900">
            {door.deviceId}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${door.online ? "bg-emerald-500" : "bg-slate-300"}`}
            />
            {door.online ? "En línea" : "Sin conexión"} ·{" "}
            {DOOR_SCOPE_LABELS[door.scope]}
          </p>
        </div>

        {door.remoteControl ? (
          <button
            type="button"
            onClick={() => (phase === "uncertain" ? onResolve() : onCommand(action))}
            disabled={
              busy ||
              (phase !== "uncertain" &&
                (!enabled || !door.online || phase === "settling" || cooldown > 0))
            }
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 ${
              phase === "uncertain"
                ? "bg-amber-600 hover:bg-amber-700"
                : action === "close"
                  ? "bg-slate-800 hover:bg-slate-700"
                  : "bg-brand hover:bg-brand-hover"
            }`}
          >
            {pendingAction ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cooldown > 0 ? (
              <Clock className="h-4 w-4" />
            ) : null}
            {label}
          </button>
        ) : null}
      </div>

      {phase === "closable" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          Pulso enviado · se puede cerrar durante {secondsUntil(door.openUntil, now)} s
        </p>
      ) : phase === "settling" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          Puede estar bajando · nadie pulsa durante {secondsUntil(door.settlesAt, now)} s
        </p>
      ) : phase === "uncertain" ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          Pulso sin confirmar. Revisa la barrera antes de liberarla para los huéspedes.
        </p>
      ) : door.scope === "vehicular" && !door.remoteControl ? (
        <p className="mt-2 text-xs text-slate-400">
          Sin apertura remota: faltan los tiempos medidos de la barrera.
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
  const {
    overview,
    loading,
    error,
    pending,
    results,
    cooldowns,
    command,
    resolve,
    reload,
  } = useRemoteDoors();
  const buildings = overview?.buildings ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Si al recargar el elegido ya no viene, se muestra el primero.
  const selected =
    buildings.find((building) => building.buildingId === selectedId) ??
    buildings[0];
  const [now, setNow] = useState(() => Date.now());
  const anyOpen =
    buildings.some((building) =>
      building.doors.some((door) => door.settlesAt || door.cooldownUntil),
    ) || Object.values(cooldowns).some((iso) => new Date(iso).getTime() > now);

  // Cuenta regresiva de las barreras recién pulsadas, sin volver a pedir la lista.
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

            {selected ? (
              <BuildingSelect
                buildings={buildings}
                value={selected.buildingId}
                onChange={setSelectedId}
              />
            ) : null}

            {selected ? (
              <article className="rounded-xl bg-white p-4 shadow-sm">
                {!selected.online ? (
                  <p className="mb-3 text-xs font-medium text-amber-700">
                    Edificio sin conexión
                  </p>
                ) : null}

                <ul className="divide-y divide-slate-100">
                  {selected.doors.map((door) => (
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
                      cooldownUntil={cooldowns[door.deviceId] ?? null}
                      onCommand={(action) => void command(door.deviceId, action)}
                      onResolve={() => void resolve(door.deviceId)}
                    />
                  ))}
                </ul>
              </article>
            ) : null}
          </div>
        </section>
      </main>
    </AppLayout>
  );
};
