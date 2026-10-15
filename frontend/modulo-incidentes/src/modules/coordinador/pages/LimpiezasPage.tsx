import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  Clock,
  Search,
  TriangleAlert,
} from "lucide-react";
import { STATUS_LEVELS } from "@/shared/constants/statusPalette";
import type { CoordTask, EmployeeOption } from "../types/Coordinador";
import { describeApiError } from "../services/coordinadorService";
import { useCoordTasks, useEmployees } from "../hooks/useCoordData";
import { useNow } from "../hooks/useNow";
import {
  addDays,
  formatDate,
  formatDuration,
  formatPersonName,
  formatRange,
  hmOf,
  minutesOfDay,
  relativeDay,
  todayYmd,
  ymdOf,
} from "../domain/dates";
import {
  findOverlaps,
  isOverdue,
  isPending,
  isReopened,
  overdueMinutes,
  STATUS,
  statusKey,
  taskDate,
} from "../domain/tasks";
import { SourceBadge, StatusBadges } from "../components/taskBits";
import {
  employeeName,
  matchesSearch,
  placeLabel,
  plannedLabel,
  unitLabel,
} from "../components/taskLabels";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Segmented,
  Skeleton,
  SortHeader,
  TD,
  TH,
  FOCUS,
} from "../components/ui";
import { compareBy, cx, inputClass, useSort } from "../components/uiUtils";
import { useOpenTask } from "../layout/useOpenTask";
import { DateField } from "../components/DateField";

type StatusKey = keyof typeof STATUS;

const STATUS_ORDER: StatusKey[] = [
  "pending",
  "assigned",
  "paused",
  "inProgress",
  "review",
  "done",
  "cancelled",
];

const DATE_FILTERS = [
  { value: "todas", label: "Todas las fechas" },
  { value: "hoy", label: "Hoy" },
  { value: "manana", label: "Mañana" },
  { value: "semana", label: "Próximos 7 días" },
  { value: "pasados", label: "Últimos 7 días" },
] as const;

type DateFilter = (typeof DATE_FILTERS)[number]["value"];

const inDateFilter = (
  task: CoordTask,
  filter: DateFilter,
  today: string,
): boolean => {
  const date = taskDate(task);
  if (filter === "hoy") return date === today;
  if (filter === "manana") return date === addDays(today, 1);
  if (filter === "semana") return date >= today && date <= addDays(today, 7);
  if (filter === "pasados") return date < today && date >= addDays(today, -7);
  return true;
};

// ─── Tabla ──────────────────────────────────────────────────────────────────

const TableView = ({
  tasks,
  today,
  nowMs,
}: {
  tasks: CoordTask[];
  today: string;
  nowMs: number;
}) => {
  const { open } = useOpenTask();
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<StatusKey[]>(STATUS_ORDER);
  const [dates, setDates] = useState<DateFilter>("todas");
  const [sort, onSort] = useSort({ key: "creada", dir: "desc" });

  const base = useMemo(
    () =>
      tasks.filter((t) => inDateFilter(t, dates, today) && matchesSearch(t, q)),
    [tasks, dates, today, q],
  );

  const statusCount = useMemo(() => {
    const counts = {} as Record<StatusKey, number>;
    STATUS_ORDER.forEach((key) => {
      counts[key] = base.filter((t) => statusKey(t) === key).length;
    });
    return counts;
  }, [base]);

  const visible = useMemo(
    () =>
      base
        .filter((t) => statuses.includes(statusKey(t)))
        .sort(
          compareBy<CoordTask>(sort, {
            creada: (t) => t.id,
            numero: (t) => t.taskNumber,
            checkout: (t) => t.checkoutDate,
            planificada: (t) => t.plannedStartTime,
            empleado: (t) =>
              t.employee ? formatPersonName(t.employee.name) : null,
          }),
        ),
    [base, statuses, sort],
  );

  const toggleStatus = (key: StatusKey) =>
    setStatuses((list) =>
      list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label
          className="relative block w-full max-w-xs"
          htmlFor="buscar-limpiezas"
        >
          <span className="sr-only">Buscar</span>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <Search className="h-4 w-4" aria-hidden="true" />
          </span>
          <input
            id="buscar-limpiezas"
            type="search"
            className={inputClass(false, "pl-9")}
            placeholder="Número, unidad, listing o reserva"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Fecha"
          className={inputClass(false, "w-auto")}
          value={dates}
          onChange={(e) => setDates(e.target.value as DateFilter)}
        >
          {DATE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Estados">
        {STATUS_ORDER.map((key) => {
          const on = statuses.includes(key);
          const status = STATUS[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStatus(key)}
              className={cx(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold transition",
                FOCUS,
                on
                  ? STATUS_LEVELS[status.level].badge
                  : "border border-dashed border-slate-300 bg-white text-slate-400",
              )}
            >
              {status.label}
              <span className="tabular-nums opacity-70">
                {statusCount[key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card bodyClass="">
        {visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Ninguna limpieza coincide con los filtros."
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <SortHeader
                    label="Número"
                    sortKey="numero"
                    sort={sort}
                    onSort={onSort}
                  />
                  <th scope="col" className={TH}>
                    Descripción
                  </th>
                  <th scope="col" className={TH}>
                    Unidad
                  </th>
                  <SortHeader
                    label="Checkout"
                    sortKey="checkout"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Planificada"
                    sortKey="planificada"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Empleado"
                    sortKey="empleado"
                    sort={sort}
                    onSort={onSort}
                  />
                  <th scope="col" className={TH}>
                    Estado
                  </th>
                  <th scope="col" className={TH}>
                    Origen
                  </th>
                  <SortHeader
                    label="Creada"
                    sortKey="creada"
                    sort={sort}
                    onSort={onSort}
                  />
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => open(t.id)}
                  >
                    <td className={TD}>
                      <button
                        type="button"
                        className={cx(
                          "font-mono font-semibold text-slate-900 hover:text-brand",
                          FOCUS,
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          open(t.id);
                        }}
                      >
                        {t.taskNumber}
                      </button>
                    </td>
                    <td className={cx(TD, "max-w-[16rem]")}>
                      <p
                        className="truncate text-slate-700"
                        title={t.description ?? ""}
                      >
                        {t.description}
                      </p>
                    </td>
                    <td className={cx(TD, "max-w-[14rem] text-slate-700")}>
                      {t.unit ? (
                        <p className="truncate" title={unitLabel(t.unit)}>
                          {unitLabel(t.unit)}
                        </p>
                      ) : (
                        <span className="text-slate-400">Sin unidad</span>
                      )}
                    </td>
                    <td
                      className={cx(
                        TD,
                        "whitespace-nowrap tabular-nums text-slate-700",
                      )}
                    >
                      {t.checkoutDate ? (
                        formatDate(t.checkoutDate)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className={cx(
                        TD,
                        "whitespace-nowrap tabular-nums text-slate-700",
                      )}
                    >
                      {t.plannedStartTime ? (
                        plannedLabel(t)
                      ) : (
                        <span className="text-slate-400">Sin horario</span>
                      )}
                    </td>
                    <td className={cx(TD, "whitespace-nowrap text-slate-700")}>
                      {t.employee ? (
                        employeeName(t.employee)
                      ) : (
                        <span className="text-slate-400">Sin asignar</span>
                      )}
                    </td>
                    <td className={TD}>
                      <StatusBadges task={t} nowMs={nowMs} />
                    </td>
                    <td className={TD}>
                      <SourceBadge source={t.source} />
                    </td>
                    <td
                      className={cx(
                        TD,
                        "whitespace-nowrap tabular-nums text-slate-500",
                      )}
                    >
                      {relativeDay(t.generatedDate, today)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
          Mostrando {visible.length} de {tasks.length} limpiezas. Las recién
          creadas aparecen primero.
        </p>
      </Card>
    </div>
  );
};

// ─── Agenda del día ─────────────────────────────────────────────────────────

const LANE = 52;

/** Reparte las limpiezas de un empleado en carriles para que las que se cruzan no se tapen. */
const assignLanes = (list: CoordTask[]) => {
  const lanes: number[] = [];
  const placed = [...list]
    .sort(
      (a, b) =>
        Date.parse(a.plannedStartTime as string) -
        Date.parse(b.plannedStartTime as string),
    )
    .map((task) => {
      const start = Date.parse(task.plannedStartTime as string);
      let lane = lanes.findIndex((end) => end <= start);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(0);
      }
      lanes[lane] = Date.parse(task.plannedEndTime as string);
      return { task, lane };
    });
  return { placed, laneCount: Math.max(1, lanes.length) };
};

const Block = ({
  task,
  lane,
  pct,
  overlapping,
  nowMs,
}: {
  task: CoordTask;
  lane: number;
  pct: (minutes: number) => number;
  overlapping: boolean;
  nowMs: number;
}) => {
  const { open } = useOpenTask();
  const key = statusKey(task);
  const level = STATUS[key].level;
  const startMin = minutesOfDay(task.plannedStartTime) ?? 0;
  const endMin = minutesOfDay(task.plannedEndTime) ?? startMin;
  const overdue = overdueMinutes(task, nowMs);
  const left = pct(startMin);
  const width = Math.max(pct(endMin) - left, 4);

  let actual: { left: number; width: number; done: boolean } | null = null;
  if (
    task.actualStartTime &&
    ymdOf(task.actualStartTime) === ymdOf(task.plannedStartTime)
  ) {
    const aStart = minutesOfDay(task.actualStartTime) ?? 0;
    const aEnd = task.actualEndTime
      ? minutesOfDay(task.actualEndTime)
      : task.phase === "InExecution"
        ? minutesOfDay(new Date(nowMs).toISOString())
        : null;
    if (aEnd !== null && aEnd > aStart) {
      actual = {
        left: pct(aStart),
        width: Math.max(pct(aEnd) - pct(aStart), 0.6),
        done: Boolean(task.actualEndTime),
      };
    }
  }

  const tooltip =
    `${task.taskNumber} · ${task.description} · ${STATUS[key].label}` +
    (overdue ? ` · atrasada ${formatDuration(overdue)}` : "") +
    (isReopened(task) ? " · reabierta" : "") +
    (overlapping ? " · se superpone" : "");

  return (
    <>
      <button
        type="button"
        onClick={() => open(task.id)}
        title={tooltip}
        style={{
          left: `${left}%`,
          width: `${width}%`,
          top: 4 + lane * LANE,
          height: LANE - 12,
        }}
        className={cx(
          "absolute overflow-hidden rounded-lg border-l-4 bg-white px-2 py-1 text-left text-xs shadow-sm transition hover:z-10 hover:shadow-md",
          FOCUS,
          STATUS_LEVELS[level].border,
          overlapping
            ? "ring-2 ring-red-400"
            : overdue
              ? "ring-2 ring-red-300"
              : "ring-1 ring-slate-200",
        )}
      >
        <span className="flex items-center gap-1 font-semibold tabular-nums text-slate-900">
          {overlapping ? (
            <TriangleAlert
              className="h-3.5 w-3.5 shrink-0 text-red-600"
              aria-label="Se superpone"
            />
          ) : null}
          {task.isPaused ? (
            <CirclePause
              className="h-3.5 w-3.5 shrink-0 text-violet-600"
              aria-label="En pausa"
            />
          ) : null}
          {overdue ? (
            <Clock
              className="h-3.5 w-3.5 shrink-0 text-red-600"
              aria-label="Atrasada"
            />
          ) : null}
          <span className="truncate">
            {formatRange(task.plannedStartTime, task.plannedEndTime)}
          </span>
        </span>
        <span className="block truncate text-slate-500">
          {`${task.unit ? task.unit.code : placeLabel(task)} · ${task.taskNumber}`}
        </span>
      </button>
      {actual ? (
        <span
          aria-hidden="true"
          className={cx(
            "absolute h-1 rounded-full",
            actual.done ? "bg-emerald-500" : "bg-blue-500",
          )}
          style={{
            left: `${actual.left}%`,
            width: `${actual.width}%`,
            top: 4 + lane * LANE + (LANE - 10),
          }}
        />
      ) : null}
    </>
  );
};

const AgendaView = ({
  tasks,
  employees,
  today,
  nowMs,
}: {
  tasks: CoordTask[];
  employees: EmployeeOption[];
  today: string;
  nowMs: number;
}) => {
  const navigate = useNavigate();
  const { open } = useOpenTask();
  const [day, setDay] = useState(today);

  const planned = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.phase !== "Cancelled" &&
          t.plannedStartTime &&
          t.plannedEndTime &&
          ymdOf(t.plannedStartTime) === day,
      ),
    [tasks, day],
  );
  const unscheduled = tasks.filter(
    (t) => isPending(t) && !t.plannedStartTime && taskDate(t) === day,
  );
  const overlaps = useMemo(() => findOverlaps(planned), [planned]);
  const overdueCount = planned.filter((t) => isOverdue(t, nowMs)).length;
  const overlapPairs = Math.round(
    Array.from(overlaps.values()).reduce((n, list) => n + list.length, 0) / 2,
  );
  const pendingTotal = tasks.filter(isPending).length;

  // La escala va de 06:00 a 20:00 y se amplía si alguna limpieza cae fuera.
  let startHour = 6;
  let endHour = 20;
  planned.forEach((t) => {
    startHour = Math.min(
      startHour,
      Math.floor((minutesOfDay(t.plannedStartTime) ?? 360) / 60),
    );
    endHour = Math.max(
      endHour,
      Math.ceil((minutesOfDay(t.plannedEndTime) ?? 1200) / 60),
    );
  });
  const total = (endHour - startHour) * 60;
  const pct = (minutes: number) =>
    Math.min(100, Math.max(0, ((minutes - startHour * 60) / total) * 100));
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  const grid = {
    backgroundImage: `repeating-linear-gradient(to right, rgb(226 232 240) 0, rgb(226 232 240) 1px, transparent 1px, transparent calc(100% / ${endHour - startHour}))`,
  };

  const groups = useMemo(() => {
    const byEmployee = new Map<number | "sin", CoordTask[]>();
    planned.forEach((t) => {
      const key = t.employee ? t.employee.id : "sin";
      byEmployee.set(key, [...(byEmployee.get(key) ?? []), t]);
    });
    const teams = new Map<
      string,
      Array<{ employee: EmployeeOption | null; tasks: CoordTask[] }>
    >();
    employees.forEach((e) => {
      const list = byEmployee.get(e.id) ?? [];
      if (!list.length) return;
      const team = e.team ? e.team.name : "Sin equipo";
      teams.set(team, [
        ...(teams.get(team) ?? []),
        { employee: e, tasks: list },
      ]);
    });
    const result = Array.from(teams.entries()).map(([team, rows]) => ({
      team,
      rows,
    }));
    if (byEmployee.has("sin")) {
      result.push({
        team: "Sin empleado",
        rows: [{ employee: null, tasks: byEmployee.get("sin") ?? [] }],
      });
    }
    return result;
  }, [planned, employees]);

  const nowIso = new Date(nowMs).toISOString();
  const nowLeft = day === today ? pct(minutesOfDay(nowIso) ?? 0) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={ChevronLeft}
            aria-label="Día anterior"
            onClick={() => setDay(addDays(day, -1))}
          />
          <Button onClick={() => setDay(today)} disabled={day === today}>
            Hoy
          </Button>
          <Button
            icon={ChevronRight}
            aria-label="Día siguiente"
            onClick={() => setDay(addDays(day, 1))}
          />
          <DateField
            id="agenda-dia"
            ariaLabel="Día"
            value={day}
            onChange={setDay}
          />
        </div>
      </div>

      <p className="text-sm text-slate-600">
        <strong className="tabular-nums text-slate-900">
          {planned.length}
        </strong>
        {planned.length === 1 ? " limpieza" : " limpiezas"} ·{" "}
        <strong
          className={cx(
            "tabular-nums",
            overdueCount ? "text-red-700" : "text-slate-900",
          )}
        >
          {overdueCount}
        </strong>
        {overdueCount === 1 ? " atrasada" : " atrasadas"} ·{" "}
        <strong
          className={cx(
            "tabular-nums",
            overlapPairs ? "text-red-700" : "text-slate-900",
          )}
        >
          {overlapPairs}
        </strong>
        {overlapPairs === 1 ? " superposición" : " superposiciones"} ·{" "}
        <strong className="tabular-nums text-slate-900">
          {unscheduled.length}
        </strong>{" "}
        sin horario
      </p>

      {unscheduled.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sin horario
          </span>
          {unscheduled.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => open(t.id, "editar")}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-400 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-brand hover:text-brand",
                FOCUS,
              )}
            >
              <span className="font-mono font-semibold">{t.taskNumber}</span>
              <span>{placeLabel(t)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <Card bodyClass="">
        {planned.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No hay limpiezas planificadas para este día."
            action={
              pendingTotal ? (
                <Button onClick={() => navigate("/coordinador/pendientes")}>
                  Ver pendientes ({pendingTotal})
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="relative overflow-x-auto">
            <div className="min-w-[1000px]">
              <div className="flex border-b border-slate-200 bg-slate-50">
                <div className="sticky left-0 z-20 w-56 shrink-0 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Empleado
                </div>
                <div className="relative h-8 flex-1">
                  {hours.map((h) => (
                    <span
                      key={h}
                      className={cx(
                        "absolute top-2 text-xs tabular-nums text-slate-500",
                        h === startHour
                          ? "pl-1"
                          : h === endHour
                            ? "-translate-x-full pr-1"
                            : "-translate-x-1/2",
                      )}
                      style={{ left: `${pct(h * 60)}%` }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                  {nowLeft !== null ? (
                    <span
                      className="absolute top-1 z-10 -translate-x-1/2 rounded bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white"
                      style={{ left: `${nowLeft}%` }}
                    >
                      {hmOf(nowIso)}
                    </span>
                  ) : null}
                </div>
              </div>

              {groups.map((group) => (
                <div key={group.team}>
                  <div className="sticky left-0 border-b border-slate-100 bg-white px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group.team}
                  </div>
                  {group.rows.map((row) => {
                    const { placed, laneCount } = assignLanes(row.tasks);
                    const minutes = row.tasks.reduce(
                      (sum, t) =>
                        sum +
                        (Date.parse(t.plannedEndTime as string) -
                          Date.parse(t.plannedStartTime as string)) /
                          60_000,
                      0,
                    );
                    return (
                      <div
                        key={row.employee ? row.employee.id : "sin"}
                        className="flex border-b border-slate-100"
                      >
                        <div className="sticky left-0 z-20 w-56 shrink-0 bg-white px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {row.employee
                              ? formatPersonName(row.employee.name)
                              : "Sin empleado"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {row.tasks.length
                              ? `${row.tasks.length} ${row.tasks.length === 1 ? "limpieza" : "limpiezas"} · ${formatDuration(minutes)}`
                              : "Libre"}
                          </p>
                        </div>
                        <div
                          className="relative flex-1"
                          style={{ height: laneCount * LANE + 8, ...grid }}
                        >
                          {nowLeft !== null ? (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-0 z-10 w-px bg-red-500"
                              style={{ left: `${nowLeft}%` }}
                            />
                          ) : null}
                          {placed.map(({ task, lane }) => (
                            <Block
                              key={task.id}
                              task={task}
                              lane={lane}
                              pct={pct}
                              overlapping={overlaps.has(task.id)}
                              nowMs={nowMs}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-500">Leyenda:</span>
        {(
          ["assigned", "inProgress", "paused", "review", "done"] as StatusKey[]
        ).map((key) => (
          <span
            key={key}
            className={cx(
              "rounded-md px-2 py-1 font-semibold",
              STATUS_LEVELS[STATUS[key].level].badge,
            )}
          >
            {STATUS[key].label}
          </span>
        ))}
        <span className="rounded-md bg-red-100 px-2 py-1 font-semibold text-red-700">
          Atrasada
        </span>
        <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700 ring-2 ring-red-400">
          Superposición
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-6 rounded-full bg-blue-500" />
          Ejecución real
        </span>
      </div>
    </div>
  );
};

// ─── Pantalla ───────────────────────────────────────────────────────────────

/** Todas las limpiezas: la tabla y la agenda del día (dos rutas, mismo encabezado). */
export const LimpiezasPage = () => {
  const navigate = useNavigate();
  const isAgenda = useLocation().pathname.endsWith("/agenda");
  const nowMs = useNow();
  const today = todayYmd(nowMs);
  const tasksQ = useCoordTasks();
  const employeesQ = useEmployees();

  const failed =
    (tasksQ.isError && !tasksQ.data) ||
    (employeesQ.isError && !employeesQ.data);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Limpiezas"
        subtitle="Todas las limpiezas, creadas por la sincronización o a mano."
        actions={
          <>
            <Segmented<"limpiezas" | "agenda">
              label="Vista"
              value={isAgenda ? "agenda" : "limpiezas"}
              onChange={(v) => navigate(`/coordinador/${v}`)}
              options={[
                { value: "limpiezas", label: "Tabla" },
                { value: "agenda", label: "Agenda del día" },
              ]}
            />
          </>
        }
      />

      {failed ? (
        <Card bodyClass="">
          <ErrorState
            message={describeApiError(
              tasksQ.error ?? employeesQ.error,
              "Intenta de nuevo.",
            )}
            onRetry={() => {
              void tasksQ.refetch();
              void employeesQ.refetch();
            }}
          />
        </Card>
      ) : !tasksQ.data || !employeesQ.data ? (
        <Card bodyClass="">
          <Skeleton rows={8} />
        </Card>
      ) : isAgenda ? (
        <AgendaView
          tasks={tasksQ.data}
          employees={employeesQ.data}
          today={today}
          nowMs={nowMs}
        />
      ) : (
        <TableView tasks={tasksQ.data} today={today} nowMs={nowMs} />
      )}
    </div>
  );
};
