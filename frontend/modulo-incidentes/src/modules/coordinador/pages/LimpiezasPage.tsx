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
import { StatusBadges } from "../components/taskBits";
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
  Pagination,
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
import { FilterMenu, type FilterOption } from "../components/FilterMenu";

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

const STATUS_OPTIONS: FilterOption<StatusKey>[] = STATUS_ORDER.map((key) => ({
  value: key,
  label: STATUS[key].label,
  dotClass: STATUS_LEVELS[STATUS[key].level].bar,
}));

const PAGE_SIZE = 20;

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
  // Un día concreto (hoy al abrir) o `null` para todas las fechas.
  const [day, setDay] = useState<string | null>(today);
  // Sin columna "Creada", pero el orden inicial sigue siendo "recién creadas primero".
  const [sort, onSort] = useSort({ key: "creada", dir: "desc" });
  const [page, setPage] = useState(1);

  // Cambiar un filtro o el orden vuelve a la primera página.
  const changeQuery = (next: string) => {
    setQ(next);
    setPage(1);
  };
  const changeDay = (next: string | null) => {
    setDay(next);
    setPage(1);
  };
  const changeStatuses = (next: StatusKey[]) => {
    setStatuses(next);
    setPage(1);
  };
  const changeSort = (key: string) => {
    onSort(key);
    setPage(1);
  };

  const visible = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            (day === null || taskDate(t) === day) &&
            statuses.includes(statusKey(t)) &&
            matchesSearch(t, q),
        )
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
    [tasks, day, statuses, q, sort],
  );

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const pageRows = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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
            onChange={(e) => changeQuery(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <DateField
            id="limpiezas-dia"
            ariaLabel="Día"
            value={day ?? ""}
            onChange={changeDay}
          />
          {day !== today ? (
            <Button onClick={() => changeDay(today)}>Hoy</Button>
          ) : null}
          {day !== null ? (
            <Button onClick={() => changeDay(null)}>Todas las fechas</Button>
          ) : null}
        </div>
        <FilterMenu
          label="Estados"
          options={STATUS_OPTIONS}
          selected={statuses}
          onChange={changeStatuses}
        />
      </div>

      <Card bodyClass="">
        {visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Ninguna limpieza coincide con los filtros."
            action={
              day !== null ? (
                <Button onClick={() => changeDay(null)}>
                  Ver todas las fechas
                </Button>
              ) : null
            }
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
                    onSort={changeSort}
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
                    onSort={changeSort}
                  />
                  <SortHeader
                    label="Planificada"
                    sortKey="planificada"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <SortHeader
                    label="Empleado"
                    sortKey="empleado"
                    sort={sort}
                    onSort={changeSort}
                  />
                  <th scope="col" className={TH}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={visible.length}
          onPage={setPage}
          noun="limpiezas"
        />
      </Card>
    </div>
  );
};

// ─── Agenda del día ─────────────────────────────────────────────────────────

const LANE = 70;
const BLOCK_H = 62;
/** Ancho de una hora y de la columna de empleados, en px. La agenda se desplaza si no cabe. */
const HOUR_PX = 92;
const NAME_COL = 224;
/** Ancho mínimo de una tarjeta: una limpieza corta sigue siendo legible. */
const MIN_BLOCK_W = 160;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 17;

const blockWidth = (startMin: number, endMin: number) =>
  Math.max(((endMin - startMin) / 60) * HOUR_PX - 4, MIN_BLOCK_W);

/** Reparte las limpiezas de un empleado en carriles; cuenta el ancho mínimo para que las seguidas no se tapen. */
const assignLanes = (list: CoordTask[]) => {
  const lanes: number[] = [];
  const placed = [...list]
    .sort(
      (a, b) =>
        Date.parse(a.plannedStartTime as string) -
        Date.parse(b.plannedStartTime as string),
    )
    .map((task) => {
      const startMin = minutesOfDay(task.plannedStartTime) ?? 0;
      const endMin = minutesOfDay(task.plannedEndTime) ?? startMin;
      const left = (startMin / 60) * HOUR_PX;
      let lane = lanes.findIndex((end) => end <= left);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(0);
      }
      lanes[lane] = left + blockWidth(startMin, endMin) + 4;
      return { task, lane };
    });
  return { placed, laneCount: Math.max(1, lanes.length) };
};

const Block = ({
  task,
  lane,
  px,
  overlapping,
  nowMs,
}: {
  task: CoordTask;
  lane: number;
  px: (minutes: number) => number;
  overlapping: boolean;
  nowMs: number;
}) => {
  const { open } = useOpenTask();
  const key = statusKey(task);
  const level = STATUS[key].level;
  const startMin = minutesOfDay(task.plannedStartTime) ?? 0;
  const endMin = minutesOfDay(task.plannedEndTime) ?? startMin;
  const overdue = overdueMinutes(task, nowMs);
  const left = px(startMin);
  const width = blockWidth(startMin, endMin);

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
        left: px(aStart),
        width: Math.max(px(aEnd) - px(aStart), 4),
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
          left: left + 2,
          width,
          top: 4 + lane * LANE,
          height: BLOCK_H,
        }}
        className={cx(
          "absolute overflow-hidden rounded-lg border-l-4 bg-white px-2.5 py-1 text-left text-xs shadow-sm transition hover:z-10 hover:shadow-md",
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
        <span className="block truncate text-slate-600">
          {`${task.unit ? task.unit.code : placeLabel(task)} · ${task.taskNumber}`}
        </span>
        <span className="block truncate font-semibold text-slate-600">
          {STATUS[key].label}
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
            left: actual.left + 2,
            width: actual.width,
            top: 4 + lane * LANE + BLOCK_H + 1,
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

  // La escala va de 07:00 a 17:00 y se amplía (con desplazamiento) si alguna limpieza cae fuera.
  let startHour = DAY_START_HOUR;
  let endHour = DAY_END_HOUR;
  planned.forEach((t) => {
    startHour = Math.min(
      startHour,
      Math.floor((minutesOfDay(t.plannedStartTime) ?? 0) / 60),
    );
    endHour = Math.max(
      endHour,
      Math.ceil(
        Math.max(
          (minutesOfDay(t.plannedEndTime) ?? 0) / 60,
          (minutesOfDay(t.plannedStartTime) ?? 0) / 60 + MIN_BLOCK_W / HOUR_PX,
        ),
      ),
    );
  });
  const timelineW = (endHour - startHour) * HOUR_PX;
  const px = (minutes: number) => ((minutes - startHour * 60) / 60) * HOUR_PX;
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += 1) hours.push(h);
  const grid = {
    backgroundImage: `repeating-linear-gradient(to right, rgb(226 232 240) 0, rgb(226 232 240) 1px, transparent 1px, transparent ${HOUR_PX}px)`,
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
    // La lista solo trae al equipo de operarios: una limpieza que ya tenía a
    // alguien de fuera se agenda aparte en vez de desaparecer.
    const listed = new Set(employees.map((e) => e.id));
    const outside = Array.from(byEmployee.entries()).flatMap(([key, tasks]) =>
      key === "sin" || listed.has(key)
        ? []
        : [{ employee: { ...tasks[0].employee!, team: null }, tasks }],
    );
    if (outside.length) {
      result.push({ team: "Fuera del equipo de operarios", rows: outside });
    }
    if (byEmployee.has("sin")) {
      result.push({
        team: "Sin empleado",
        rows: [{ employee: null, tasks: byEmployee.get("sin") ?? [] }],
      });
    }
    return result;
  }, [planned, employees]);

  const nowIso = new Date(nowMs).toISOString();
  const nowLeft = day === today ? px(minutesOfDay(nowIso) ?? 0) : null;

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
          <div className="relative max-h-[60vh] overflow-auto">
            <div style={{ width: NAME_COL + timelineW }}>
              <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-slate-50">
                <div
                  className="sticky left-0 z-20 shrink-0 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  style={{ width: NAME_COL }}
                >
                  Empleado
                </div>
                <div className="relative h-8" style={{ width: timelineW }}>
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="absolute top-2 pl-1.5 text-xs tabular-nums text-slate-500"
                      style={{ left: px(h * 60) }}
                    >
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                  {nowLeft !== null ? (
                    <span
                      className="absolute top-1 z-10 -translate-x-1/2 rounded bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white"
                      style={{ left: nowLeft }}
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
                        <div
                          className="sticky left-0 z-20 shrink-0 bg-white px-4 py-3"
                          style={{ width: NAME_COL }}
                        >
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
                          className="relative"
                          style={{
                            width: timelineW,
                            height: laneCount * LANE + 8,
                            ...grid,
                          }}
                        >
                          {nowLeft !== null ? (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-0 z-10 w-px bg-red-500"
                              style={{ left: nowLeft }}
                            />
                          ) : null}
                          {placed.map(({ task, lane }) => (
                            <Block
                              key={task.id}
                              task={task}
                              lane={lane}
                              px={px}
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
