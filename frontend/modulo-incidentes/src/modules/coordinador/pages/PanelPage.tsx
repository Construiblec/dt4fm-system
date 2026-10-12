import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  Inbox,
  Play,
  type LucideIcon,
} from "lucide-react";
import { describeApiError } from "../services/coordinadorService";
import { useCheckoutPreview, useCoordTasks } from "../hooks/useCoordData";
import { useNow } from "../hooks/useNow";
import { addDays, todayYmd, ymdOf } from "../domain/dates";
import { isPending, taskDate } from "../domain/tasks";
import { StatusBadges } from "../components/taskBits";
import { employeeName } from "../components/taskLabels";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  TD,
  TH,
  FOCUS,
} from "../components/ui";
import { cx } from "../components/uiUtils";
import { useOpenTask } from "../layout/useOpenTask";

const TILE_TONE = {
  default: "text-slate-900",
  warn: "text-amber-700",
  bad: "text-red-700",
} as const;

const Tile = ({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  sub: string;
  tone?: keyof typeof TILE_TONE;
  icon: LucideIcon;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      "flex w-full flex-col items-start gap-1 rounded-2xl bg-white p-4 text-left shadow-sm transition hover:shadow-md",
      FOCUS,
    )}
  >
    <span className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
    </span>
    <span className={cx("text-3xl font-bold tabular-nums", TILE_TONE[tone])}>
      {value}
    </span>
    <span className="text-xs text-slate-500">{sub}</span>
  </button>
);

/** Mientras llegan los checkouts de Hostaway: la misma tabla, en gris. */
const CheckoutsSkeleton = () => (
  <div
    className="divide-y divide-slate-100"
    aria-busy="true"
    aria-label="Cargando los checkouts de hoy"
  >
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className="flex animate-pulse items-center gap-6 px-4 py-4 motion-reduce:animate-none"
      >
        <div className="w-1/4 space-y-2">
          <div className="h-3.5 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-24 rounded-md bg-slate-100" />
        <div className="h-6 w-20 rounded-md bg-slate-100" />
        <div className="h-3.5 w-28 rounded bg-slate-100" />
        <div className="ml-auto h-8 w-24 rounded-lg bg-slate-100" />
      </div>
    ))}
  </div>
);

/** Panel del día: qué salió de Hostaway hoy, qué falta asignar y qué pide atención. */
export const PanelPage = () => {
  const navigate = useNavigate();
  const { open } = useOpenTask();
  const nowMs = useNow();
  const today = todayYmd(nowMs);
  const tasksQ = useCoordTasks();
  const todayQ = useCheckoutPreview(today, today);

  const stats = useMemo(() => {
    const tasks = tasksQ.data ?? [];
    const pending = tasks.filter(isPending);
    const plannedToday = tasks.filter(
      (t) =>
        t.phase !== "Cancelled" &&
        t.plannedStartTime &&
        ymdOf(t.plannedStartTime) === today,
    );

    return {
      pending: pending.length,
      pendingSoon: pending.filter((t) => taskDate(t) <= addDays(today, 1))
        .length,
      plannedToday: plannedToday.length,
      notStartedToday: plannedToday.filter(
        (t) => t.phase === "Assigned" && !t.actualStartTime && !t.isPaused,
      ).length,
      inExecution: tasks.filter((t) => t.phase === "InExecution").length,
      paused: tasks.filter((t) => t.isPaused).length,
    };
  }, [tasksQ.data, today]);

  const rows = (todayQ.data?.rows ?? [])
    .filter((r) => (r.hostawayCheckoutDate ?? r.checkoutDate) === today)
    .sort((a, b) => a.listingName.localeCompare(b.listingName));

  const syncToday = () =>
    navigate("/coordinador/sincronizacion", {
      state: { intent: "sync-today" },
    });

  return (
    <div className="space-y-6">
      <PageHeader title="Panel del día" />

      {tasksQ.isError ? (
        <Card bodyClass="">
          <ErrorState
            message={describeApiError(tasksQ.error, "Intenta de nuevo.")}
            onRetry={() => void tasksQ.refetch()}
          />
        </Card>
      ) : !tasksQ.data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-white shadow-sm motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Tile
            label="Por asignar"
            icon={Inbox}
            value={stats.pending}
            tone={stats.pending ? "warn" : "default"}
            sub={`${stats.pendingSoon} con checkout hasta mañana`}
            onClick={() => navigate("/coordinador/pendientes")}
          />
          <Tile
            label="Programadas hoy"
            icon={CalendarDays}
            value={stats.plannedToday}
            sub={`${stats.notStartedToday} sin empezar`}
            onClick={() => navigate("/coordinador/agenda")}
          />
          <Tile
            label="En ejecución"
            icon={Play}
            value={stats.inExecution}
            sub={
              stats.paused ? `+${stats.paused} en pausa` : "ninguna en pausa"
            }
            onClick={() => navigate("/coordinador/agenda")}
          />
        </div>
      )}

      <Card
        title="Checkouts de hoy"
        subtitle={
          todayQ.data
            ? `${rows.length} ${rows.length === 1 ? "reserva" : "reservas"} de Hostaway ${rows.length === 1 ? "sale" : "salen"} hoy`
            : "Reservas de Hostaway que salen hoy"
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            iconRight={ChevronRight}
            onClick={() => navigate("/coordinador/sincronizacion")}
          >
            Sincronización
          </Button>
        }
        bodyClass=""
      >
        {todayQ.isError ? (
          <ErrorState
            title="No se pudo consultar Hostaway."
            message={describeApiError(
              todayQ.error,
              "Intenta de nuevo más tarde.",
            )}
            onRetry={() => void todayQ.refetch()}
          />
        ) : !todayQ.data ? (
          <CheckoutsSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Hoy no sale ninguna reserva.">
            No hay limpiezas de checkout para hoy.
          </EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className={TH}>
                    Listing
                  </th>
                  <th scope="col" className={TH}>
                    Limpieza
                  </th>
                  <th scope="col" className={TH}>
                    Estado
                  </th>
                  <th scope="col" className={TH}>
                    Empleado
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.reservationId}
                    className="border-t border-slate-100"
                  >
                    <td className={TD}>
                      <p className="whitespace-nowrap font-medium text-slate-900">
                        {r.listingName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.task?.unit
                          ? r.task.unit.code
                          : r.unitMatch === "ok"
                            ? ""
                            : r.unitMatch === "none"
                              ? "Agregar unidad manualmente"
                              : "Listing en 2 unidades"}
                      </p>
                    </td>
                    <td className={TD}>
                      {r.task ? (
                        <button
                          type="button"
                          onClick={() => open(r.task!.id)}
                          className={cx(
                            "font-mono font-semibold text-brand hover:underline",
                            FOCUS,
                          )}
                        >
                          {r.task.taskNumber}
                        </button>
                      ) : (
                        <Chip tone="blue">Sin crear</Chip>
                      )}
                    </td>
                    <td className={TD}>
                      {r.task ? (
                        <StatusBadges task={r.task} nowMs={nowMs} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={cx(TD, "whitespace-nowrap text-slate-700")}>
                      {r.task ? (
                        employeeName(r.task.employee)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={cx(TD, "text-right")}>
                      {!r.task ? (
                        <Button size="sm" onClick={syncToday}>
                          Sincronizar
                        </Button>
                      ) : isPending(r.task) ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => open(r.task!.id, "editar")}
                        >
                          Completar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
