import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  CalendarCheck,
  Link2Off,
  Plus,
  RefreshCw,
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
  formatDate,
  relativeDay,
  todayYmd,
} from "../domain/dates";
import { canEdit, isPending } from "../domain/tasks";
import { Modal } from "../components/overlays";
import { DateField } from "../components/DateField";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  InlineAlert,
  PageHeader,
  Pagination,
  Segmented,
  Skeleton,
  TD,
  TH,
} from "../components/ui";
import { cx } from "../components/uiUtils";
import { useCoordFlash } from "../layout/flash";
import { useOpenTask } from "../layout/useOpenTask";

/** Lo que se muestra. Las "huérfanas" (la reserva ya no sale en Hostaway) no le sirven al coordinador. */
type ShownStatus = Exclude<CheckoutStatus, "huerfana">;

const STATUS_CHIP: Record<
  ShownStatus,
  { tone: "blue" | "slate" | "amber"; label: string }
> = {
  "por-crear": { tone: "blue", label: "Por crear" },
  creada: { tone: "slate", label: "Ya creada" },
  cambio: { tone: "amber", label: "Checkout cambió" },
};

const isShown = (
  row: CheckoutRow,
): row is CheckoutRow & { status: ShownStatus } => row.status !== "huerfana";

const resultMessage = (result: SyncResult, single: boolean) => {
  if (result.failed > 0) {
    return {
      tone: "error" as const,
      text: "Se crearon las limpiezas, pero algunas reservas fallaron.",
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
    text: "Limpiezas creadas correctamente.",
  };
};

type RunState = {
  /** Día que se está creando o que se creó (YYYY-MM-DD). */
  day: string | null;
  running: boolean;
  result: SyncResult | null;
  error: string | null;
};
const IDLE: RunState = {
  day: null,
  running: false,
  result: null,
  error: null,
};

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
      <InlineAlert tone="error" title="No se pudieron crear las limpiezas.">
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
  label,
  onCancel,
  onConfirm,
}: {
  day: string;
  /** "hoy" o "mañana". */
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <Modal
    title={`Crear limpiezas de ${label}`}
    onClose={onCancel}
    footer={
      <>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" icon={RefreshCw} onClick={onConfirm}>
          Crear limpiezas
        </Button>
      </>
    }
  >
    <p>
      {`¿Deseas crear las tareas de limpieza de los checkouts de ${label} (${formatDate(day)})? Las reservas que ya tienen limpieza se omiten.`}
    </p>
  </Modal>
);

const PAGE_SIZE = 10;

type Filter = "todos" | "por-crear" | "creada";

/**
 * Creación automática de las limpiezas a partir de los checkouts de Hostaway
 * (reemplaza la página ExtJS de openMAINT): las de hoy o las de mañana de una
 * vez, y la revisión de los checkouts de un día con el estado de cada reserva
 * para crear una limpieza suelta.
 */
export const SincronizacionPage = () => {
  const { open } = useOpenTask();
  const nowMs = useNow();
  const today = todayYmd(nowMs);
  const invalidate = useInvalidateCoord();
  const flash = useCoordFlash((s) => s.show);
  const tasksQ = useCoordTasks();

  const tomorrow = addDays(today, 1);
  const [dayState, setDayState] = useState<RunState>(IDLE);
  const [confirmDay, setConfirmDay] = useState<string | null>(null);
  // Un solo día: los checkouts de esa fecha.
  const [day, setDay] = useState(today);
  const [filter, setFilter] = useState<Filter>("todos");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState<string | null>(null);
  // Limpiezas recién creadas desde esta lista: ofrecen "Completar" sin esperar a que Hostaway se vuelva a consultar.
  const [createdTasks, setCreatedTasks] = useState<Record<string, number>>({});

  const previewQ = useCheckoutPreview(day, day);

  const rows = (previewQ.data?.rows ?? []).filter(isShown);
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
    onSuccess: async (result, date) => {
      setDayState({ day: date, running: false, result, error: null });
      await invalidate();
    },
    onError: (error, date) =>
      setDayState({
        day: date,
        running: false,
        result: null,
        error: describeApiError(error, "Intenta de nuevo."),
      }),
  });

  const runSync = (date: string) => {
    setDayState({ day: date, running: true, result: null, error: null });
    setConfirmDay(null);
    syncMutation.mutate(date);
  };
  const dayLabel = (date: string) => relativeDay(date, today);

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

  const changeDay = (next: string) => {
    setDay(next);
    setPage(1);
  };

  const busy = dayState.running;

  return (
    <div className="space-y-6">
      <PageHeader title="Creación automática de tareas de limpiezas" />

      <Card title="Crear limpiezas de un día">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              icon={RefreshCw}
              loading={dayState.running && dayState.day === today}
              disabled={busy}
              onClick={() => setConfirmDay(today)}
            >
              Crear limpiezas de hoy
            </Button>
            <Button
              icon={RefreshCw}
              loading={dayState.running && dayState.day === tomorrow}
              disabled={busy}
              onClick={() => setConfirmDay(tomorrow)}
            >
              Crear limpiezas de mañana
            </Button>
          </div>
          {dayState.day && !dayState.running ? (
            <p className="text-sm font-semibold text-slate-700">
              {`Resultado de ${dayLabel(dayState.day)} (${formatDate(dayState.day)})`}
            </p>
          ) : null}
          <SyncOutcome state={dayState} single />
        </div>
      </Card>

      <Card
        title="Próximas limpiezas"
        subtitle="Revisa los checkouts de un día."
        bodyClass=""
      >
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <DateField
            id="proximas-dia"
            ariaLabel="Día"
            value={day}
            onChange={changeDay}
          />
          {day !== today ? (
            <Button onClick={() => changeDay(today)}>Hoy</Button>
          ) : null}
          {day !== tomorrow ? (
            <Button onClick={() => changeDay(tomorrow)}>Mañana</Button>
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
                : "No hay checkouts para este día."
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
                    Unidad
                  </th>
                  <th scope="col" className={TH}>
                    Estado
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
                          {formatDate(shownDate)}
                        </p>
                        {r.status === "cambio" && r.task ? (
                          <p className="text-xs text-amber-700">
                            La limpieza dice {formatDate(r.task.checkoutDate)}
                          </p>
                        ) : null}
                      </td>
                      <td className={TD}>
                        <p className="font-medium text-slate-900">
                          {r.listingName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
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
                      <td className={TD}>
                        <Chip tone={chip.tone}>{chip.label}</Chip>
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
              ? `${previewQ.data.count} ${previewQ.data.count === 1 ? "checkout encontrado" : "checkouts encontrados"} el ${formatDate(previewQ.data.dateFrom)}`
              : "No hay checkouts para este día."}
          </p>
        ) : null}
      </Card>

      {confirmDay ? (
        <ConfirmModal
          day={confirmDay}
          label={dayLabel(confirmDay)}
          onCancel={() => setConfirmDay(null)}
          onConfirm={() => runSync(confirmDay)}
        />
      ) : null}
    </div>
  );
};
