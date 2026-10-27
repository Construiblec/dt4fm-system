import { useMemo, useState, type DragEvent } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Search,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import type { CoordTask, EmployeeOption } from "../types/Coordinador";
import { describeApiError, updateTask } from "../services/coordinadorService";
import {
  useChecklists,
  useCoordTasks,
  useEmployees,
  useInvalidateCoord,
} from "../hooks/useCoordData";
import { useNow } from "../hooks/useNow";
import { formatPersonName, isoAt, todayYmd } from "../domain/dates";
import { conflictsFor } from "../domain/tasks";
import {
  draftFor,
  dragIds,
  isDirty,
  planPayload,
  scheduleChip,
  tasksByEmployee,
  unassignedTasks,
  visibleEmployees,
  type EmployeeLimit,
  type PlanDraft,
} from "../domain/assignment";
import { placeLabel, matchesSearch } from "../components/taskLabels";
import { DateField } from "../components/DateField";
import { TimeField } from "../components/TimeField";
import { ChecklistSelect } from "../components/pickers";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  FOCUS,
  InlineAlert,
  PageHeader,
  Segmented,
  Skeleton,
} from "../components/ui";
import { cx, inputClass } from "../components/uiUtils";
import { useCoordFlash } from "../layout/flash";

const DRAG_TYPE = "application/x-coord-tasks";

const LIMIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "4", label: "4" },
  { value: "6", label: "6" },
  { value: "8", label: "8" },
  { value: "all", label: "Todos" },
];

const initials = (name: string) =>
  formatPersonName(name)
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

// ─── Una limpieza ya asignada: acordeón con fecha, horas y checklist ───────

const TaskAccordion = ({
  task,
  tasks,
  today,
  open,
  onToggle,
  checklists,
}: {
  task: CoordTask;
  tasks: CoordTask[];
  today: string;
  open: boolean;
  onToggle: () => void;
  checklists: NonNullable<ReturnType<typeof useChecklists>["data"]>;
}) => {
  const invalidate = useInvalidateCoord();
  const flash = useCoordFlash((s) => s.show);
  const [draft, setDraft] = useState<PlanDraft>(() => draftFor(task, today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chip = scheduleChip(task);
  const dirty = isDirty(draft, task, today);
  const conflicts = conflictsFor(
    task.employee?.id ?? null,
    draft.date && draft.start ? isoAt(draft.date, draft.start) : null,
    draft.date && draft.end ? isoAt(draft.date, draft.end) : null,
    tasks,
    [task.id],
  );
  const panelId = `asignacion-tarea-${task.id}`;

  const save = async () => {
    const result = planPayload(draft, task);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await updateTask(task.id, result.payload);
      await invalidate();
      flash("success", `${task.taskNumber} quedó planificada.`);
    } catch (e) {
      setError(describeApiError(e, "No se pudo guardar la limpieza."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cx(
        "rounded-xl",
        open ? "bg-sky-50 ring-1 ring-sky-300" : "bg-slate-50",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cx(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
          FOCUS,
        )}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-bold text-slate-900">{task.taskNumber}</span>
          <span className="text-slate-500">
            {" "}
            {task.description?.replace(/^Limpieza - /, "") ?? "Limpieza"} ·{" "}
            {placeLabel(task)}
          </span>
        </span>
        <span
          className={cx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
            chip ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {chip ?? "Sin fecha ni hora"}
        </span>
      </button>

      {open ? (
        <div id={panelId} className="space-y-3 px-3 pb-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[10rem_8rem_8rem_1fr]">
            <Field label="Fecha de asignación" htmlFor={`${panelId}-fecha`}>
              <DateField
                id={`${panelId}-fecha`}
                width="w-full"
                value={draft.date}
                onChange={(date) => setDraft({ ...draft, date })}
              />
            </Field>
            <Field label="Hora de inicio" htmlFor={`${panelId}-inicio`}>
              <TimeField
                id={`${panelId}-inicio`}
                value={draft.start}
                onChange={(start) => setDraft({ ...draft, start })}
              />
            </Field>
            <Field label="Hora de fin" htmlFor={`${panelId}-fin`}>
              <TimeField
                id={`${panelId}-fin`}
                value={draft.end}
                onChange={(end) => setDraft({ ...draft, end })}
              />
            </Field>
            <Field label="Checklist" htmlFor={`${panelId}-checklist`}>
              <ChecklistSelect
                id={`${panelId}-checklist`}
                value={draft.checklistId}
                checklists={checklists}
                onChange={(checklistId) => setDraft({ ...draft, checklistId })}
              />
            </Field>
          </div>

          {conflicts.length ? (
            <InlineAlert tone="warning" icon={TriangleAlert}>
              Se cruza con {conflicts.map((c) => c.taskNumber).join(", ")} del
              mismo operador.
            </InlineAlert>
          ) : null}
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={!dirty || saving}
              onClick={() => {
                setDraft(draftFor(task, today));
                setError(null);
              }}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Guardar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ─── Un operador: acordeón que recibe limpiezas ────────────────────────────

const EmployeeAccordion = ({
  employee,
  list,
  allTasks,
  today,
  open,
  onToggle,
  openTask,
  onToggleTask,
  checklists,
  dragging,
  onDropIds,
}: {
  employee: EmployeeOption;
  list: CoordTask[];
  allTasks: CoordTask[];
  today: string;
  open: boolean;
  onToggle: () => void;
  openTask: number | null;
  onToggleTask: (id: number) => void;
  checklists: NonNullable<ReturnType<typeof useChecklists>["data"]>;
  dragging: boolean;
  onDropIds: (employeeId: number, ids: number[]) => void;
}) => {
  const [over, setOver] = useState(false);
  const panelId = `asignacion-operador-${employee.id}`;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    try {
      const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as number[];
      if (ids.length) onDropIds(employee.id, ids);
    } catch {
      /* no era una limpieza */
    }
  };

  return (
    <section
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={onDrop}
      className={cx(
        "rounded-2xl border bg-white shadow-sm transition",
        over
          ? "border-2 border-brand bg-blue-50/60"
          : dragging
            ? "border-dashed border-slate-300"
            : "border-slate-200",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={cx(
          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left",
          FOCUS,
        )}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
        )}
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
          {initials(employee.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {formatPersonName(employee.name)}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {employee.team?.name ?? "Operador de limpieza"}
          </span>
        </span>
        <span
          className={cx(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            list.length ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600",
          )}
        >
          {list.length} {list.length === 1 ? "tarea" : "tareas"}
        </span>
      </button>

      {open ? (
        <div id={panelId} className="space-y-2 px-3 pb-3">
          {list.map((task) => (
            <TaskAccordion
              key={task.id}
              task={task}
              tasks={allTasks}
              today={today}
              open={openTask === task.id}
              onToggle={() => onToggleTask(task.id)}
              checklists={checklists}
            />
          ))}
          <p
            className={cx(
              "rounded-xl border border-dashed px-3 py-2 text-center text-sm font-semibold",
              over
                ? "border-brand bg-blue-100 text-blue-700"
                : "border-slate-300 bg-slate-50 text-slate-500",
            )}
          >
            {over
              ? "Suelta aquí para asignar"
              : list.length
                ? "Suelta aquí más limpiezas"
                : "Sin tareas asignadas. Arrastra limpiezas a este tablero"}
          </p>
        </div>
      ) : null}
    </section>
  );
};

// ─── Pantalla ───────────────────────────────────────────────────────────────

export const AsignacionPage = () => {
  const nowMs = useNow();
  const today = todayYmd(nowMs);
  const tasksQ = useCoordTasks();
  const employeesQ = useEmployees();
  const checklistsQ = useChecklists();
  const invalidate = useInvalidateCoord();
  const flash = useCoordFlash((s) => s.show);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState<EmployeeLimit>(4);
  const [employeeQ, setEmployeeQ] = useState("");
  const [openEmployees, setOpenEmployees] = useState<Set<number>>(new Set());
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("");

  const tasks = tasksQ.data;
  const employees = employeesQ.data;
  const unassigned = useMemo(
    () => (tasks ? unassignedTasks(tasks).filter((t) => matchesSearch(t, q)) : []),
    [tasks, q],
  );
  const byEmployee = useMemo(
    () => (tasks ? tasksByEmployee(tasks) : new Map<number, CoordTask[]>()),
    [tasks],
  );
  const { shown, total } = useMemo(
    () => visibleEmployees(employees ?? [], employeeQ, limit),
    [employees, employeeQ, limit],
  );

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const assign = async (employeeId: number, ids: number[]) => {
    setBusy(true);
    setError(null);
    const results = await Promise.allSettled(
      ids.map((id) => updateTask(id, { employeeId })),
    );
    const failed = results.filter((r) => r.status === "rejected");
    await invalidate();
    setSelected(new Set());
    setOpenEmployees((s) => new Set(s).add(employeeId));
    setBusy(false);
    if (failed.length) {
      setError(
        `${failed.length} de ${ids.length} limpiezas no se pudieron asignar. ${describeApiError(
          (failed[0] as PromiseRejectedResult).reason,
          "Intenta de nuevo.",
        )}`,
      );
    } else {
      flash("success", `${ids.length} ${ids.length === 1 ? "limpieza asignada" : "limpiezas asignadas"}. Ahora define su hora.`);
    }
  };

  const onDragStart = (e: DragEvent, taskId: number) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds(taskId, selected)));
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  };

  const failed = (tasksQ.isError && !tasks) || (employeesQ.isError && !employees);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asignación de limpiezas"
        subtitle="Arrastra las limpiezas a un operador y define su fecha, hora y checklist en el mismo tablero."
      />

      {failed ? (
        <Card bodyClass="">
          <ErrorState
            message={describeApiError(tasksQ.error ?? employeesQ.error, "Intenta de nuevo.")}
            onRetry={() => {
              void tasksQ.refetch();
              void employeesQ.refetch();
            }}
          />
        </Card>
      ) : !tasks || !employees || !checklistsQ.data ? (
        <Card bodyClass="">
          <Skeleton rows={8} />
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Card
            title={
              <span className="flex items-center gap-2">
                Sin asignar
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  {unassigned.length}
                </span>
              </span>
            }
            bodyClass="space-y-3 px-4 py-4"
          >
            <label className="relative block" htmlFor="asignacion-buscar">
              <span className="sr-only">Buscar limpieza o ubicación</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Search className="h-4 w-4" aria-hidden="true" />
              </span>
              <input
                id="asignacion-buscar"
                type="search"
                className={inputClass(false, "pl-9")}
                placeholder="Buscar limpieza o ubicación"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>

            {selected.size ? (
              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <strong className="text-blue-700">
                    {selected.size} {selected.size === 1 ? "seleccionada" : "seleccionadas"}
                  </strong>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className={cx("text-xs font-semibold text-brand", FOCUS)}
                  >
                    Quitar selección
                  </button>
                </div>
                <div className="flex gap-2">
                  <label className="sr-only" htmlFor="asignacion-destino">
                    Asignar las seleccionadas a
                  </label>
                  <select
                    id="asignacion-destino"
                    className={inputClass(false, "py-1.5")}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Asignar a…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {formatPersonName(e.name)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!target || busy}
                    loading={busy}
                    onClick={() => void assign(Number(target), [...selected])}
                  >
                    Asignar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Marca varias y arrástralas juntas al tablero de un operador.
              </p>
            )}

            {unassigned.length === 0 ? (
              <EmptyState
                icon={Check}
                title={q ? "Ninguna limpieza coincide." : "No hay limpiezas sin asignar."}
              />
            ) : (
              <ul className="max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto pr-1">
                {unassigned.map((task) => {
                  const on = selected.has(task.id);
                  return (
                    <li
                      key={task.id}
                      draggable={!busy}
                      onDragStart={(e) => onDragStart(e, task.id)}
                      onDragEnd={() => setDragging(false)}
                      className={cx(
                        "flex cursor-grab items-center gap-2.5 rounded-xl border px-3 py-2.5 active:cursor-grabbing",
                        on ? "border-brand bg-blue-50" : "border-slate-200 bg-white",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setSelected(toggle(selected, task.id))}
                        aria-label={`Seleccionar ${task.taskNumber}`}
                        className="h-4 w-4 rounded border-slate-300 text-brand"
                      />
                      <GripVertical className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {task.taskNumber} ·{" "}
                          {task.description?.replace(/^Limpieza - /, "") ?? "Limpieza"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {placeLabel(task)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Operadores</h2>
                <p className="text-sm text-slate-500">
                  Mostrando {shown.length} de {total}
                  {total > shown.length ? (
                    <>
                      {" "}
                      · {total - shown.length} ocultos por el filtro.{" "}
                      <button
                        type="button"
                        onClick={() => setLimit("all")}
                        className={cx("font-semibold text-brand", FOCUS)}
                      >
                        Mostrar todos
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-600">Mostrar</span>
                <Segmented<string>
                  label="Cantidad de operadores"
                  value={String(limit)}
                  onChange={(v) => setLimit(v === "all" ? "all" : (Number(v) as EmployeeLimit))}
                  options={LIMIT_OPTIONS}
                />
                <label className="relative block w-44" htmlFor="asignacion-operador">
                  <span className="sr-only">Buscar operador</span>
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <Search className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <input
                    id="asignacion-operador"
                    type="search"
                    className={inputClass(false, "pl-9")}
                    placeholder="Operador"
                    value={employeeQ}
                    onChange={(e) => setEmployeeQ(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

            {shown.length === 0 ? (
              <Card>
                <EmptyState icon={UsersRound} title="Ningún operador coincide con la búsqueda." />
              </Card>
            ) : (
              <div className="max-h-[calc(100vh-17rem)] space-y-2 overflow-y-auto pr-1">
                {shown.map((employee) => (
                  <EmployeeAccordion
                    key={employee.id}
                    employee={employee}
                    list={byEmployee.get(employee.id) ?? []}
                    allTasks={tasks}
                    today={today}
                    open={openEmployees.has(employee.id)}
                    onToggle={() => setOpenEmployees(toggle(openEmployees, employee.id))}
                    openTask={openTask}
                    onToggleTask={(id) => setOpenTask(openTask === id ? null : id)}
                    checklists={checklistsQ.data}
                    dragging={dragging}
                    onDropIds={(id, ids) => {
                      setDragging(false);
                      void assign(id, ids);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
