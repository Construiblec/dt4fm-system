import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, RefreshCw, Search } from "lucide-react";
import { describeApiError } from "../services/coordinadorService";
import { useCoordTasks } from "../hooks/useCoordData";
import { useNow } from "../hooks/useNow";
import { addDays, formatDate, relativeDay, todayYmd } from "../domain/dates";
import { isPending, taskDate } from "../domain/tasks";
import { SourceBadge } from "../components/taskBits";
import { matchesSearch, unitLabel } from "../components/taskLabels";
import {
  Button,
  Card,
  Chip,
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
import type { CoordTask } from "../types/Coordinador";

type Range = "todas" | "hasta-hoy" | "semana";

const RANGES: { value: Range; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "hasta-hoy", label: "Hasta hoy" },
  { value: "semana", label: "Próximos 7 días" },
];

const inRange = (task: CoordTask, range: Range, today: string): boolean => {
  const date = taskDate(task);
  if (range === "hasta-hoy") return date <= today;
  if (range === "semana") return date >= today && date <= addDays(today, 7);
  return true;
};

/** Lo que le falta a la limpieza para quedar asignada. */
const Missing = ({ task }: { task: CoordTask }) => (
  <span className="flex flex-wrap gap-1.5">
    {!task.employee ? <Chip tone="amber">Empleado</Chip> : null}
    {!task.plannedStartTime ? <Chip tone="amber">Horario</Chip> : null}
  </span>
);

/**
 * Pendientes por asignar: lo que dejó la sincronización (o una limpieza manual
 * sin empleado) y todavía no tiene empleado u horario. Se completan una por una.
 */
export const PendientesPage = () => {
  const navigate = useNavigate();
  const { open } = useOpenTask();
  const today = todayYmd(useNow());
  const tasksQ = useCoordTasks();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("todas");
  const [sort, onSort] = useSort({ key: "creada", dir: "desc" });

  const pending = useMemo(
    () => (tasksQ.data ?? []).filter(isPending),
    [tasksQ.data],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        RANGES.map((r) => [
          r.value,
          pending.filter((t) => inRange(t, r.value, today)).length,
        ]),
      ) as Record<Range, number>,
    [pending, today],
  );

  const visible = useMemo(
    () =>
      pending
        .filter((t) => inRange(t, range, today) && matchesSearch(t, q))
        .sort(
          compareBy<CoordTask>(sort, {
            creada: (t) => t.id,
            checkout: (t) => taskDate(t),
            limpieza: (t) => t.taskNumber,
          }),
        ),
    [pending, range, today, q, sort],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Pendientes por asignar
            {tasksQ.data ? (
              <span className="ml-2 align-middle text-lg font-semibold tabular-nums text-slate-400">
                {pending.length}
              </span>
            ) : null}
          </>
        }
        subtitle="Limpiezas sin empleado o sin horario. Las recién creadas aparecen primero."
      />

      <div className="flex flex-wrap items-center gap-3">
        <label
          className="relative block w-full max-w-sm"
          htmlFor="buscar-pendientes"
        >
          <span className="sr-only">Buscar</span>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <Search className="h-4 w-4" aria-hidden="true" />
          </span>
          <input
            id="buscar-pendientes"
            type="search"
            className={inputClass(false, "pl-9")}
            placeholder="Buscar por número, unidad, listing o reserva"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Segmented<Range>
          label="Filtrar por fecha de checkout"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({
            ...r,
            count: tasksQ.data ? counts[r.value] : null,
          }))}
        />
      </div>

      <Card bodyClass="">
        {tasksQ.isError && !tasksQ.data ? (
          <ErrorState
            title="No se pudieron cargar las limpiezas pendientes."
            message={describeApiError(tasksQ.error, "Intenta de nuevo.")}
            onRetry={() => void tasksQ.refetch()}
          />
        ) : !tasksQ.data ? (
          <Skeleton rows={7} />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title="No hay limpiezas pendientes por asignar."
            action={
              <Button
                icon={RefreshCw}
                onClick={() => navigate("/coordinador/sincronizacion")}
              >
                Ir a sincronización
              </Button>
            }
          >
            Aparecen aquí las que crea la sincronización y las manuales sin
            empleado.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Ninguna limpieza coincide con la búsqueda."
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <SortHeader
                    label="Creada"
                    sortKey="creada"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Checkout"
                    sortKey="checkout"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    label="Limpieza"
                    sortKey="limpieza"
                    sort={sort}
                    onSort={onSort}
                  />
                  <th scope="col" className={TH}>
                    Unidad
                  </th>
                  <th scope="col" className={TH}>
                    Falta
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const date = taskDate(t);
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className={cx(TD, "whitespace-nowrap")}>
                        <p className="text-slate-900">
                          {relativeDay(t.generatedDate, today)}
                        </p>
                        <p className="text-xs tabular-nums text-slate-500">
                          {formatDate(t.generatedDate)}
                        </p>
                      </td>
                      <td className={cx(TD, "whitespace-nowrap")}>
                        <p className="text-slate-900">
                          {relativeDay(date, today)}
                          {t.checkoutDate ? "" : " (planificada)"}
                        </p>
                        {date < today ? (
                          <Chip tone="red">Checkout pasado</Chip>
                        ) : (
                          <p className="text-xs tabular-nums text-slate-500">
                            {formatDate(date)}
                          </p>
                        )}
                      </td>
                      <td className={TD}>
                        <button
                          type="button"
                          onClick={() => open(t.id)}
                          className={cx(
                            "font-mono font-semibold text-slate-900 hover:text-brand hover:underline",
                            FOCUS,
                          )}
                        >
                          {t.taskNumber}
                        </button>
                        <p
                          className="max-w-xs truncate text-slate-600"
                          title={t.description ?? ""}
                        >
                          {t.description}
                        </p>
                        <div className="mt-1">
                          <SourceBadge source={t.source} />
                        </div>
                      </td>
                      <td className={TD}>
                        {t.unit ? (
                          <>
                            <p className="text-slate-900">
                              {unitLabel(t.unit)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t.unit.code}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-slate-500">Sin unidad</p>
                            {t.hostawayListingId ? (
                              <p className="font-mono text-xs text-slate-400">
                                listing {t.hostawayListingId}
                              </p>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className={TD}>
                        <Missing task={t} />
                      </td>
                      <td className={cx(TD, "text-right")}>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => open(t.id, "editar")}
                        >
                          Completar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
