import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  CalendarCheck,
  Link2Off,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
} from "lucide-react";
import type {
  CheckoutRow,
  CheckoutStatus,
  SyncResult,
} from "../types/Coordinador";
import {
  createFromCheckout,
  describeApiError,
  syncRange,
} from "../services/coordinadorService";
import {
  useCheckoutPreview,
  useCoordTasks,
  useInvalidateCoord,
} from "../hooks/useCoordData";
import { useNow } from "../hooks/useNow";
import {
  addDays,
  diffDays,
  formatDate,
  formatDayShort,
  todayYmd,
} from "../domain/dates";
import { canEdit, isPending } from "../domain/tasks";
import { StatusBadges } from "../components/taskBits";
import { Modal } from "../components/overlays";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  InlineAlert,
  PageHeader,
  Pagination,
  Segmented,
  Skeleton,
  TD,
  TH,
  FOCUS,
} from "../components/ui";
import { cx, inputClass } from "../components/uiUtils";
import { useCoordFlash } from "../layout/flash";
import { useOpenTask } from "../layout/useOpenTask";

const STATUS_CHIP: Record<
  CheckoutStatus,
  { tone: "blue" | "slate" | "amber" | "red"; label: string }
> = {
  "por-crear": { tone: "blue", label: "Por crear" },
  creada: { tone: "slate", label: "Ya creada" },
  cambio: { tone: "amber", label: "Checkout cambió" },
  huerfana: { tone: "red", label: "Ya no está en Hostaway" },
};

const MAX_RANGE_DAYS = 92;

const rangeProblem = (from: string, to: string): string | null => {
  if (!from || !to)
    return "Rango incompleto: selecciona la fecha de inicio y la de fin.";
  if (to < from)
    return "Rango inválido: la fecha de fin es anterior a la de inicio.";
  if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) {
    return `Rango demasiado amplio: el máximo es de ${MAX_RANGE_DAYS} días.`;
  }
  return null;
};

const resultMessage = (result: SyncResult, single: boolean) => {
  if (result.failed > 0) {
    return {
      tone: "error" as const,
      text: "Sincronización completada con errores.",
    };
  }
  if (result.total === 0) {
    return {
      tone: "neutral" as const,
      text: single
        ? "No hay checkouts para esta fecha."
        : "No hay checkouts en este rango.",
    };
  }
  if (result.created === 0) {
    return {
      tone: "neutral" as const,
      text: "Sin tareas nuevas: todas ya existían.",
    };
  }
  return {
    tone: "success" as const,
    text: "Sincronización completada correctamente.",
  };
};

type RunState = {
  running: boolean;
  result: SyncResult | null;
  error: string | null;
};
const IDLE: RunState = { running: false, result: null, error: null };

const SyncOutcome = ({
  state,
  single,
}: {
  state: RunState;
  single: boolean;
}) => {
  const navigate = useNavigate();

  if (state.error) {
    return (
      <InlineAlert tone="error" title="No se pudo sincronizar.">
        {state.error}
      </InlineAlert>
    );
  }
  if (!state.result) return null;

  const r = state.result;
  const message = resultMessage(r, single);
  const tiles: Array<[string, number, string]> = [
    ["Procesados", r.total, "text-slate-900"],
    ["Creadas", r.created, r.created ? "text-emerald-700" : "text-slate-700"],
    ["Duplicadas", r.skipped, "text-slate-700"],
    ["Errores", r.failed, r.failed ? "text-red-700" : "text-slate-700"],
  ];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </dt>
            <dd className={cx("text-2xl font-bold tabular-nums", tone)}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <InlineAlert
        tone={message.tone}
        action={
          r.created > 0 ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate("/coordinador/pendientes")}
            >
              {r.created === 1
                ? "Asignar la nueva"
                : `Asignar las ${r.created} nuevas`}
            </Button>
          ) : null
        }
      >
        {message.text}
      </InlineAlert>
      {r.errors.length ? (
        <ul className="space-y-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm">
          {r.errors.map((e) => (
            <li
              key={e.reservationId}
              className="flex flex-wrap gap-x-2 text-slate-700"
            >
              <span className="font-mono text-slate-900">
                {e.reservationId}
              </span>
              <span>·</span>
              <span>{e.listingName}</span>
              <span className="text-red-700">{e.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const ConfirmModal = ({
  day,
  onCancel,
  onConfirm,
}: {
  day: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <Modal
    title="Confirmar sincronización"
    onClose={onCancel}
    footer={
      <>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" icon={RefreshCw} onClick={onConfirm}>
          Sincronizar
        </Button>
      </>
    }
  >
    <p>
      {`¿Deseas generar las tareas de limpieza de los checkouts del ${formatDate(day)}? Las tareas duplicadas se omitirán automáticamente.`}
    </p>
  </Modal>
);

const PAGE_SIZE = 10;

type Filter = "todos" | "por-crear" | "creada";

/**
 * Sincronización con Hostaway: reemplaza la página ExtJS de openMAINT.
 * Sincroniza un día, y muestra el estado de cada reserva de un rango antes de
 * crear una limpieza suelta.
 */
export const SincronizacionPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { open } = useOpenTask();
  const nowMs = useNow();
  const today = todayYmd(nowMs);
  const invalidate = useInvalidateCoord();
  const flash = useCoordFlash((s) => s.show);
  const tasksQ = useCoordTasks();

  const [day, setDay] = useState(today);
  const [dayState, setDayState] = useState<RunState>(IDLE);
  const [confirm, setConfirm] = useState(
    () =>
      (location.state as { intent?: string } | null)?.intent === "sync-today",
  );
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 7));
  const [query, setQuery] = useState({ from: today, to: addDays(today, 7) });
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState<string | null>(null);
  // Limpiezas recién creadas desde esta lista: ofrecen "Completar" sin esperar a que Hostaway se vuelva a consultar.
  const [createdTasks, setCreatedTasks] = useState<Record<string, number>>({});

  // "Sincronizar hoy" del panel llega con un estado de navegación de un solo uso.
  useEffect(() => {
    if ((location.state as { intent?: string } | null)?.intent) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const previewQ = useCheckoutPreview(query.from, query.to);

  const rows = previewQ.data?.rows ?? [];
  const counts = {
    todos: rows.length,
    "por-crear": rows.filter((r) => r.status === "por-crear").length,
    creada: rows.filter((r) => r.status === "creada").length,
  };
  const visible = rows.filter((r) =>
    filter === "todos" ? true : r.status === filter,
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const pageRows = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const syncMutation = useMutation({
    mutationFn: (date: string) => syncRange(date, date),
    onSuccess: async (result) => {
      setDayState({ running: false, result, error: null });
      await invalidate();
    },
    onError: (error) =>
      setDayState({
        running: false,
        result: null,
        error: describeApiError(error, "Intenta de nuevo."),
      }),
  });

  const runSync = () => {
    setDayState({ running: true, result: null, error: null });
    setConfirm(false);
    syncMutation.mutate(day);
  };

  const createOne = async (row: CheckoutRow) => {
    setCreating(row.reservationId);
    try {
      const result = await createFromCheckout(row);
      const createdId = result.taskId;
      if (createdId) {
        setCreatedTasks((prev) => ({
          ...prev,
          [row.reservationId]: createdId,
        }));
      }
      await invalidate();
      flash(
        "success",
        result.created === false
          ? (result.message ??
              `La reserva ${row.reservationId} ya tenía limpieza.`)
          : `Limpieza ${result.taskNumber ?? ""} creada para ${row.listingName} (checkout ${formatDate(row.hostawayCheckoutDate ?? row.checkoutDate)}). Quedó en Pendientes.`,
      );
    } catch (error) {
      flash(
        "error",
        `No se pudo crear la limpieza de la reserva ${row.reservationId}: ${describeApiError(error, "Intenta de nuevo.")}`,
      );
    } finally {
      setCreating(null);
    }
  };

  const showPreview = () => {
    const problem = rangeProblem(from, to);
    setRangeError(problem);
    if (!problem) {
      setQuery({ from, to });
      setPage(1);
    }
  };

  const busy = dayState.running;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sincronización con Hostaway"
        subtitle="Crea las limpiezas a partir de los checkouts de Hostaway. Reemplaza la página de sincronización de openMAINT."
      />

      <Card
        title="Sincronizar un día"
        subtitle="Crea una limpieza por cada checkout del día elegido. Las reservas que ya tienen limpieza se omiten."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Día" htmlFor="dia-sync">
              <input
                id="dia-sync"
                type="date"
                className={inputClass(!day)}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              icon={RefreshCw}
              loading={dayState.running}
              disabled={busy || !day}
              onClick={() => setConfirm(true)}
            >
              {dayState.running ? "Sincronizando…" : "Sincronizar"}
            </Button>
          </div>
          {day && day < today ? (
            <InlineAlert tone="warning">
              Es un día pasado: se crearán limpiezas de checkouts que ya
              ocurrieron.
            </InlineAlert>
          ) : null}
          <SyncOutcome state={dayState} single />
        </div>
      </Card>

      <Card
        title="Próximas limpiezas"
        subtitle="Revisa los checkouts de un rango y crea una limpieza suelta cuando haga falta."
        bodyClass=""
      >
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Inicio" htmlFor="rango-inicio">
              <input
                id="rango-inicio"
                type="date"
                className={inputClass(Boolean(rangeError))}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="Fin" htmlFor="rango-fin">
              <input
                id="rango-fin"
                type="date"
                className={inputClass(Boolean(rangeError))}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Button icon={Search} onClick={showPreview}>
              Ver próximas limpiezas
            </Button>
          </div>
          {rangeError ? (
            <p className="text-sm font-medium text-red-600" role="alert">
              {rangeError}
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          <Segmented<Filter>
            label="Filtrar checkouts"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            options={[
              { value: "todos", label: "Todos", count: counts.todos },
              {
                value: "por-crear",
                label: "Por crear",
                count: counts["por-crear"],
              },
              { value: "creada", label: "Ya creadas", count: counts.creada },
            ]}
          />
        </div>

        {previewQ.isError && !previewQ.data ? (
          <ErrorState
            title="No se pudo consultar Hostaway."
            message={describeApiError(
              previewQ.error,
              "Intenta de nuevo más tarde.",
            )}
            onRetry={() => void previewQ.refetch()}
          />
        ) : !previewQ.data ? (
          <Skeleton rows={6} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={
              rows.length
                ? "Nada que mostrar con este filtro."
                : "No hay checkouts en el rango seleccionado."
            }
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className={TH}>
                    Checkout
                  </th>
                  <th scope="col" className={TH}>
                    Listing
                  </th>
                  <th scope="col" className={TH}>
                    Reserva
                  </th>
                  <th scope="col" className={TH}>
                    Estado
                  </th>
                  <th scope="col" className={TH}>
                    Limpieza
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const chip = STATUS_CHIP[r.status];
                  const shownDate = r.hostawayCheckoutDate ?? r.checkoutDate;
                  return (
                    <tr
                      key={r.reservationId}
                      className="border-t border-slate-100"
                    >
                      <td className={cx(TD, "whitespace-nowrap")}>
                        <p className="font-medium tabular-nums text-slate-900">
                          {formatDayShort(shownDate)}
                        </p>
                        {r.status === "cambio" && r.task ? (
                          <p className="text-xs text-amber-700">
                            La limpieza dice{" "}
                            {formatDayShort(r.task.checkoutDate)}
                          </p>
                        ) : r.status === "huerfana" ? (
                          <p className="text-xs text-red-700">
                            Limpieza del {formatDayShort(r.checkoutDate)}
                          </p>
                        ) : null}
                      </td>
                      <td className={TD}>
                        <p className="font-medium text-slate-900">
                          {r.listingName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="font-mono">
                            listing {r.listingId}
                          </span>
                          {r.unitMatch === "none" ? (
                            <Chip
                              icon={Link2Off}
                              title="Ninguna unidad tiene este Hostaway Listing ID. La limpieza se crea igual, sin unidad: elígela al completarla."
                            >
                              Agregar unidad manualmente
                            </Chip>
                          ) : r.unitMatch === "ambiguous" ? (
                            <Chip
                              tone="amber"
                              title="Dos unidades tienen este HostawayListingID: la limpieza se crea sin unidad."
                            >
                              Listing en 2 unidades
                            </Chip>
                          ) : null}
                        </div>
                      </td>
                      <td className={cx(TD, "font-mono text-slate-700")}>
                        {r.reservationId}
                      </td>
                      <td className={TD}>
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                      </td>
                      <td className={TD}>
                        {r.task ? (
                          <div className="flex flex-col items-start gap-1">
                            <button
                              type="button"
                              className={cx(
                                "font-mono font-semibold text-brand hover:underline",
                                FOCUS,
                              )}
                              onClick={() => open(r.task!.id)}
                            >
                              {r.task.taskNumber}
                            </button>
                            <StatusBadges task={r.task} nowMs={nowMs} />
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={cx(TD, "text-right")}>
                        {createdTasks[r.reservationId] ||
                        (r.task &&
                          r.status === "creada" &&
                          isPending(r.task)) ? (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={UserCheck}
                            onClick={() =>
                              open(
                                createdTasks[r.reservationId] ?? r.task!.id,
                                "editar",
                              )
                            }
                          >
                            Completar
                          </Button>
                        ) : r.status === "por-crear" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={Plus}
                            loading={creating === r.reservationId}
                            disabled={busy || Boolean(creating) || !tasksQ.data}
                            onClick={() => void createOne(r)}
                          >
                            Crear limpieza
                          </Button>
                        ) : r.status === "cambio" &&
                          r.task &&
                          canEdit(r.task) ? (
                          <Button
                            size="sm"
                            onClick={() => open(r.task!.id, "editar")}
                          >
                            Corregir fecha
                          </Button>
                        ) : r.status === "huerfana" && r.task ? (
                          <Button size="sm" onClick={() => open(r.task!.id)}>
                            Revisar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={currentPage}
          pageSize={PAGE_SIZE}
          total={visible.length}
          onPage={setPage}
          noun="checkouts"
        />

        {previewQ.data ? (
          <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
            {previewQ.data.count
              ? `${previewQ.data.count} ${previewQ.data.count === 1 ? "checkout encontrado" : "checkouts encontrados"} entre el ${formatDate(previewQ.data.dateFrom)} y el ${formatDate(previewQ.data.dateTo)}`
              : "No hay checkouts en el rango seleccionado."}
          </p>
        ) : null}
      </Card>

      {confirm ? (
        <ConfirmModal
          day={day}
          onCancel={() => setConfirm(false)}
          onConfirm={runSync}
        />
      ) : null}
    </div>
  );
};
