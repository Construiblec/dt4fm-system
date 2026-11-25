import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { describeError } from '../../common/logging/describe-error.util';
import {
  CANCELLED_STATUSES,
  VALID_RESERVATION_STATUSES,
} from '../../integrations/hostaway/hostaway.constants';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { CleaningNoticesService } from './cleaning-notices.service';
import type { CleaningPlanSnapshot } from './cleaning-planning.types';
import { CleaningSupervisionsService } from './cleaning-supervisions.service';
import type {
  CleaningSyncAction,
  CleaningSyncContract,
  CleaningSyncRunResult,
  CleaningSyncStatus,
} from './cleaning-sync.types';
import {
  CleaningTaskCard,
  CleaningTasksOpenmaintService,
  UnitListingCard,
} from './cleaning-tasks.openmaint.service';
import {
  CleaningTasksService,
  guayaquilToday,
  isUnstartedTask,
} from './cleaning-tasks.service';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';
import { PHASE_IDS, PHASE_NAMES } from './constants/phase.constants';
import { CleaningSyncBaseline } from './entities/cleaning-sync-baseline.entity';
import { CleaningSyncCancellation } from './entities/cleaning-sync-cancellation.entity';

const DEFAULT_DAYS = 2;
const MAX_DAYS = 14;
const RUN_EXPIRES_MS = 10 * 60_000;
const SIGNAL_DELAY_MS = 5_000;
const MAX_PENDING_SIGNALS = 200;
const MAX_REMEMBERED = 500;
const MAX_BASELINES = 1_000;
/** Con datos más viejos no se crea sin volver a preguntar por la reserva. */
const ROW_MAX_AGE_MS = 60_000;
/** Consultas simultáneas a Hostaway dentro de una pasada. */
const STATE_CONCURRENCY = 5;
/** Para las llamadas sin timeout propio: una colgada no puede retener la cola. */
const CALL_TIMEOUT_MS = 30_000;
const CREATE_TIMEOUT_MS = 180_000;

const CANCEL_REASON = 'Reserva cancelada en Hostaway';
const DESCRIPTION_PREFIX = 'Limpieza - ';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVATION_ID = /^[\w-]{1,64}$/;

type Window = { from: string; to: string };

type Reservation = {
  id: string;
  kind: 'valid' | 'cancelled';
  checkoutDate: string | null;
  checkoutTime: string | number | null;
  listingId: string;
  listingName: string;
  guestName: string;
};

/** Lo último que Hostaway dijo de la reserva de una limpieza; listing vacío = desconocido. */
type Baseline = { date: string; listing: string };
type CachedBaseline = Baseline & { saved: boolean };
type BaselineEntry = { taskId: number; base: Baseline };

type Decision =
  | { kind: 'unchanged' | 'skipped'; baseline?: BaselineEntry }
  /** Sin base y ya planificada: no se sabe quién puso la diferencia. Se adopta y se deja. */
  | { kind: 'adopt'; baseline: BaselineEntry }
  | { kind: 'create'; ignoreTaskIds: number[] }
  | { kind: 'update' | 'cancel'; taskId: number };

type Plan = { date: boolean; listing: boolean; adopt: boolean };

type Run = { startedAt: number; promise: Promise<CleaningSyncRunResult> };

/** Otra pasada tomó el relevo: esta deja de escribir. */
class SupersededError extends Error {}

const isCancelled = (task: CleaningTaskCard): boolean =>
  (task._phase_description ?? String(task.phase)) ===
    PHASE_NAMES[PHASE_IDS.CANCELLED] ||
  String(task.phase) === String(PHASE_IDS.CANCELLED);

const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const guayaquilDay = (instant?: string | null): string | null => {
  const time = instant ? Date.parse(instant) : NaN;
  return Number.isNaN(time)
    ? null
    : new Date(time).toLocaleDateString('en-CA', {
        timeZone: 'America/Guayaquil',
      });
};

const isRealDate = (value: string): boolean =>
  DATE.test(value) && addDays(value, 0) === value;

const inWindow = (date: string | null, window: Window): date is string =>
  date !== null && date >= window.from && date <= window.to;

const reservationOf = (task: CleaningTaskCard): string =>
  String(task.HostawayReservation ?? '').trim();

const changesOf = (reservation: Reservation, task: CleaningTaskCard) => {
  const cardListing = String(task.HostawayListingID ?? '').trim();
  return {
    date:
      reservation.checkoutDate !== null &&
      (task.CheckoutDate ?? '').slice(0, 10) !== reservation.checkoutDate,
    // Un listing vacío en cualquiera de los dos lados no es un cambio.
    listing:
      cardListing !== '' &&
      reservation.listingId !== '' &&
      cardListing !== reservation.listingId,
  };
};

/** Qué campos aplicar: solo los que cambió Hostaway desde la base. */
const planFor = (
  reservation: Reservation,
  task: CleaningTaskCard,
  base: Baseline | null,
): Plan => {
  const changes = changesOf(reservation, task);
  const planned = Boolean(
    task.Employee || task.PlannedStartTime || task.PlannedEndTime,
  );
  const unknownDate = changes.date && !base?.date;
  const unknownListing = changes.listing && !base?.listing;
  return {
    date:
      changes.date &&
      (unknownDate ? !planned : base?.date !== reservation.checkoutDate),
    listing:
      changes.listing &&
      (unknownListing ? !planned : base?.listing !== reservation.listingId),
    adopt: planned && (unknownDate || unknownListing),
  };
};

/** ¿La tarjeta ya tiene lo que se quiso escribir? `Unit` no cuenta: la fuente la vincula sola. */
const reflects = (
  body: Record<string, unknown>,
  task: CleaningTaskCard,
): boolean =>
  Object.entries(body).every(([field, value]) => {
    if (field === 'Unit') return true;
    const current = (task as Record<string, unknown>)[field] || null;
    return field === 'CheckoutDate'
      ? typeof current === 'string' && current.slice(0, 10) === value
      : current === value;
  });

const snapshotOf = (task: CleaningTaskCard): CleaningPlanSnapshot => ({
  employeeId: task.Employee ?? null,
  plannedStartTime: task.PlannedStartTime ?? null,
  plannedEndTime: task.PlannedEndTime ?? null,
});

const withTimeout = async <T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: sin respuesta en ${ms} ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/** Mantiene las limpiezas al día con las reservas de Hostaway. Ante la duda, no toca nada. */
@Injectable()
export class CleaningSyncService
  implements CleaningSyncContract, OnModuleDestroy
{
  private readonly logger = new Logger(CleaningSyncService.name);

  private running: Run | null = null;
  private lastRunAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastResult: CleaningSyncRunResult | null = null;

  /** Cola por reserva: la señal y el barrido nunca trabajan la misma a la vez. */
  private readonly queues = new Map<string, Promise<unknown>>();
  /** Señales aún sin empezar; `null` = ya venció la espera y está en cola. */
  private readonly pending = new Map<string, NodeJS.Timeout | null>();
  private signalQueue: Promise<unknown> = Promise.resolve();
  private createQueue: Promise<unknown> = Promise.resolve();
  private stopped = false;

  /** Grupos de canceladas que no fueron todas nuestras: evita consultar la tabla en cada pasada. */
  private readonly cancelledByPerson = new Set<string>();
  /** `null` = leída y sin fila. Evita consultar la tabla en cada pasada. */
  private readonly baselines = new Map<number, CachedBaseline | null>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly hostaway: HostawayService,
    private readonly cleaningTasks: CleaningTasksService,
    private readonly gateway: CleaningTasksOpenmaintService,
    private readonly session: CleaningTasksSessionService,
    private readonly supervisions: CleaningSupervisionsService,
    private readonly notices: CleaningNoticesService,
    private readonly configService: ConfigService,
    @InjectRepository(CleaningSyncCancellation)
    private readonly cancellations: Repository<CleaningSyncCancellation>,
    @InjectRepository(CleaningSyncBaseline)
    private readonly baselineRows: Repository<CleaningSyncBaseline>,
  ) {}

  onModuleDestroy(): void {
    this.stopped = true;
    for (const timer of this.pending.values()) {
      if (timer) clearTimeout(timer);
    }
    this.pending.clear();
  }

  status(): CleaningSyncStatus {
    return {
      enabled: this.enabled(),
      windowDays: this.windowDays(),
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastResult: this.lastResult,
    };
  }

  signal(reservationId: string): void {
    try {
      const id = String(reservationId ?? '').trim();
      if (this.stopped || !this.enabled() || !RESERVATION_ID.test(id)) return;
      // Lo que aún no empezó leerá el estado más reciente: basta una.
      if (this.pending.has(id)) return;
      if (this.pending.size >= MAX_PENDING_SIGNALS) {
        this.logger.debug(
          `Demasiadas señales pendientes: la reserva ${id} queda para el barrido`,
        );
        return;
      }

      const timer = setTimeout(() => this.enqueueSignal(id), SIGNAL_DELAY_MS);
      timer.unref?.();
      this.pending.set(id, timer);
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar la señal de una reserva — ${describeError(error)}`,
      );
    }
  }

  async reconcileReservation(
    reservationId: string,
  ): Promise<CleaningSyncAction> {
    const id = String(reservationId ?? '').trim();
    if (!RESERVATION_ID.test(id) || this.session.isCoolingDown()) {
      return 'skipped';
    }
    return this.exclusive(id, () => this.reconcileFresh(id));
  }

  async reconcileWindow(): Promise<CleaningSyncRunResult> {
    const window = this.window();

    if (this.session.isCoolingDown()) {
      this.logger.debug(
        'Sincronización omitida: la sesión de servicio está en enfriamiento',
      );
      return this.emptyResult(window);
    }

    if (this.running && Date.now() - this.running.startedAt < RUN_EXPIRES_MS) {
      return this.running.promise;
    }
    if (this.running) {
      this.logger.warn(
        'La sincronización anterior sigue sin terminar: se da por perdida',
      );
    }

    const run = { startedAt: Date.now() } as Run;
    this.running = run;
    run.promise = this.runWindow(run, window).finally(() => {
      if (this.running === run) this.running = null;
    });
    return run.promise;
  }

  // ─── Barrido ──────────────────────────────────────────────────────────────

  private async runWindow(
    run: Run,
    window: Window,
  ): Promise<CleaningSyncRunResult> {
    const result = this.emptyResult(window);
    let complete = false;

    try {
      await this.sweep(run, window, result);
      complete = true;
      return result;
    } catch (error) {
      result.failed++;
      throw error;
    } finally {
      if (this.running === run) {
        this.lastRunAt = new Date().toISOString();
        this.lastResult = result;
        if (complete && result.failed === 0) {
          this.lastSuccessAt = this.lastRunAt;
        }
      }
    }
  }

  private async sweep(
    run: Run,
    window: Window,
    result: CleaningSyncRunResult,
  ): Promise<void> {
    const readAt = Date.now();
    const { result: rows } = await this.hostaway.getCheckouts(
      window.from,
      window.to,
    );
    const tasks = await this.tasksByReservation(window);
    await this.preloadBaselines(
      [...tasks.values()].flat().filter(isUnstartedTask),
    );

    const pending: Array<BaselineEntry & { prev: unknown }> = [];
    const collect = (entry: BaselineEntry) =>
      pending.push({ ...entry, prev: this.baselines.get(entry.taskId) });

    const seen = new Set<string>();
    for (const row of rows) {
      const id = String(row.reservationId ?? '').trim();
      if (id && seen.has(id)) continue;
      seen.add(id);

      const reservation: Reservation = {
        id,
        kind: 'valid',
        checkoutDate: String(row.checkoutDate ?? ''),
        checkoutTime: row.checkoutTime,
        listingId: String(row.listingId ?? '').trim(),
        listingName: row.listingName,
        guestName: row.guestName,
      };
      if (
        !RESERVATION_ID.test(id) ||
        !reservation.listingId ||
        !isRealDate(reservation.checkoutDate ?? '')
      ) {
        result.skipped++;
        continue;
      }
      await this.attempt(run, result, id, () =>
        this.reconcileRow(
          reservation,
          tasks.get(id) ?? [],
          window,
          readAt,
          collect,
        ),
      );
    }
    // Las que una señal actualizó entretanto tienen una base más nueva.
    await this.saveBaselines(
      pending.filter(({ taskId, prev }) => this.baselines.get(taskId) === prev),
    );

    // Limpiezas de estos días cuya reserva no vino: solo decide el estado de cada una.
    const strays = [...tasks.entries()]
      .filter(([id, list]) => !seen.has(id) && list.some(isUnstartedTask))
      .map(([id]) => id);
    for (let i = 0; i < strays.length; i += STATE_CONCURRENCY) {
      await Promise.all(
        strays
          .slice(i, i + STATE_CONCURRENCY)
          .map((id) =>
            this.attempt(run, result, id, () => this.reconcileFresh(id)),
          ),
      );
    }
  }

  private async attempt(
    run: Run,
    result: CleaningSyncRunResult,
    id: string,
    work: () => Promise<CleaningSyncAction>,
  ): Promise<void> {
    if (this.stopped || this.running !== run) {
      throw new SupersededError('sincronización interrumpida');
    }
    try {
      if (this.session.isCoolingDown()) {
        throw new Error('la sesión de servicio está en enfriamiento');
      }
      result[await this.exclusive(id, work)]++;
    } catch (error) {
      result.failed++;
      this.logger.warn(
        `No se pudo sincronizar la reserva ${id} — ${describeError(error)}`,
      );
    }
  }

  private async tasksByReservation(
    window: Window,
  ): Promise<Map<string, CleaningTaskCard[]>> {
    const byReservation = new Map<string, CleaningTaskCard[]>();
    for (let day = window.from; day <= window.to; day = addDays(day, 1)) {
      for (const task of await this.gateway.findHostawayTasksByCheckout(day)) {
        const id = reservationOf(task);
        if (!id) continue;
        byReservation.set(id, [...(byReservation.get(id) ?? []), task]);
      }
    }
    return byReservation;
  }

  /** `known`: sus limpiezas de la ventana. Aquí solo se crea; lo demás se confirma con datos frescos. */
  private async reconcileRow(
    reservation: Reservation,
    known: CleaningTaskCard[],
    window: Window,
    readAt: number,
    collect: (entry: BaselineEntry) => void,
  ): Promise<CleaningSyncAction> {
    const tasks = known.some((task) => !isCancelled(task))
      ? known
      : await this.gateway.findTasksByReservation(reservation.id);
    const decision = await this.decide(reservation, tasks, window);

    if (decision.kind === 'unchanged' || decision.kind === 'skipped') {
      if (decision.baseline) collect(decision.baseline);
      return decision.kind;
    }
    if (
      decision.kind === 'create' &&
      decision.ignoreTaskIds.length === 0 &&
      Date.now() - readAt <= ROW_MAX_AGE_MS
    ) {
      return this.create(reservation, []);
    }
    return this.reconcileFresh(reservation.id);
  }

  // ─── Una reserva ──────────────────────────────────────────────────────────

  private async reconcileFresh(id: string): Promise<CleaningSyncAction> {
    const state = await this.hostaway.getReservationState(id);
    const tasks = await this.gateway.findTasksByReservation(id);

    if (state.kind === 'not_found') {
      if (tasks.some(isUnstartedTask)) {
        this.warnOnce(
          `not_found:${id}`,
          `Hostaway no conoce la reserva ${id}, que tiene una limpieza abierta: no se toca`,
        );
      }
      return 'skipped';
    }

    const cancelled = CANCELLED_STATUSES.includes(state.status);
    if (!cancelled && !VALID_RESERVATION_STATUSES.includes(state.status)) {
      this.logger.debug(
        `Reserva ${id} en estado "${state.status}": sus limpiezas no se tocan`,
      );
      return 'skipped';
    }

    const date = state.checkoutDate;
    const reservation: Reservation = {
      id,
      kind: cancelled ? 'cancelled' : 'valid',
      checkoutDate: date !== null && isRealDate(date) ? date : null,
      checkoutTime: state.checkoutTime,
      listingId: state.listingId.trim(),
      listingName: state.listingName,
      guestName: state.guestName,
    };
    const decision = await this.decide(reservation, tasks, this.window());

    switch (decision.kind) {
      case 'create':
        return this.create(reservation, decision.ignoreTaskIds);
      case 'update':
        return this.update(reservation, decision.taskId);
      case 'cancel':
        return this.cancel(reservation, decision.taskId);
      case 'adopt':
        await this.saveBaselines([decision.baseline]);
        return 'skipped';
      default:
        if (decision.baseline) await this.saveBaselines([decision.baseline]);
        return decision.kind;
    }
  }

  private async decide(
    reservation: Reservation,
    tasks: CleaningTaskCard[],
    window: Window,
  ): Promise<Decision> {
    const live = tasks
      .filter((task) => !isCancelled(task))
      .sort((a, b) => b._id - a._id);

    if (live.length > 1) {
      this.warnOnce(
        `dup:${live.map((task) => task._id).join(',')}`,
        `La reserva ${reservation.id} tiene ${live.length} limpiezas sin cancelar: ${live.map((task) => task._id).join(', ')}`,
      );
    }
    const unstarted = live.find(isUnstartedTask);

    if (reservation.kind === 'cancelled') {
      if (unstarted) return { kind: 'cancel', taskId: unstarted._id };
      if (live.length === 0) return { kind: 'unchanged' };
      this.logger.debug(
        `Reserva ${reservation.id} cancelada, pero su limpieza ya empezó: no se toca`,
      );
      return { kind: 'skipped' };
    }

    if (reservation.checkoutDate === null) return { kind: 'skipped' };

    const task = unstarted ?? live[0];
    if (task) {
      const changes = changesOf(reservation, task);
      const differs = changes.date || changes.listing;
      if (unstarted) {
        const base = differs ? await this.baselineOf(task._id) : null;
        const plan = planFor(reservation, task, base);
        if (plan.date || plan.listing) {
          return { kind: 'update', taskId: task._id };
        }
        const baseline = this.baselineEntry(reservation, task._id);
        return plan.adopt && baseline
          ? { kind: 'adopt', baseline }
          : { kind: 'unchanged', baseline };
      }
      if (!differs) return { kind: 'unchanged' };
      this.logger.debug(
        `La reserva ${reservation.id} cambió, pero su limpieza ${task._id} ya empezó: no se toca`,
      );
      return { kind: 'skipped' };
    }

    if (
      !reservation.listingId ||
      !inWindow(reservation.checkoutDate, window) ||
      (tasks.length > 0 && !(await this.allCancelledBySync(tasks)))
    ) {
      return { kind: 'skipped' };
    }
    return {
      kind: 'create',
      ignoreTaskIds: tasks.map((cancelled) => cancelled._id),
    };
  }

  private async allCancelledBySync(
    cancelled: CleaningTaskCard[],
  ): Promise<boolean> {
    const ids = cancelled.map((task) => task._id).sort((a, b) => a - b);
    const key = ids.join(',');
    // Se vacía al confirmar una marca.
    if (this.cancelledByPerson.has(key)) return false;

    const rows = await this.cancellations.find({
      where: { taskId: In(ids.map(String)), confirmed: true },
    });
    const marked = new Set(rows.map((row) => String(row.taskId)));
    const all = ids.every((id) => marked.has(String(id)));
    if (!all) this.remember(this.cancelledByPerson, key);
    return all;
  }

  // ─── Escrituras ───────────────────────────────────────────────────────────

  /** En serie: cada alta retiene una conexión del pool mientras tiene el candado. */
  private async create(
    reservation: Reservation,
    ignoreTaskIds: number[],
  ): Promise<CleaningSyncAction> {
    const work = this.createQueue.then(() =>
      withTimeout(
        this.cleaningTasks.createCleaningTask(
          {
            hostawayReservationId: reservation.id,
            listingName: reservation.listingName,
            listingId: reservation.listingId,
            checkoutDate: reservation.checkoutDate as string,
            checkoutTime: this.checkoutTime(reservation.checkoutTime),
            guestName: reservation.guestName,
          },
          ignoreTaskIds,
        ),
        CREATE_TIMEOUT_MS,
        `Alta de la limpieza de la reserva ${reservation.id}`,
      ),
    );
    this.createQueue = work.catch(() => undefined);

    const outcome = await work;
    if (!outcome.created) return 'unchanged';
    this.logger.log(
      `Limpieza creada: id=${outcome.taskId} reserva=${reservation.id}` +
        (ignoreTaskIds.length > 0 ? ' (la reserva volvió a estar activa)' : ''),
    );
    if (outcome.taskId !== null) {
      const baseline = this.baselineEntry(reservation, outcome.taskId);
      if (baseline) await this.saveBaselines([baseline]);
    }
    return 'created';
  }

  private async update(
    reservation: Reservation,
    taskId: number,
  ): Promise<CleaningSyncAction> {
    const base = await this.baselineOf(taskId);
    // Antes de la última relectura: entre ella y la escritura no va nada.
    let units: UnitListingCard[] = [];
    let card = await this.rereadUnstarted(reservation.id, taskId);
    if (card && planFor(reservation, card, base).listing) {
      units = await this.gateway.listUnitsWithListingOrThrow();
      card = await this.rereadUnstarted(reservation.id, taskId);
    }
    if (!card) return 'skipped';

    const plan = planFor(reservation, card, base);
    // Cambió justo ahora: se decide en la próxima pasada.
    if (!plan.date && !plan.listing) return 'skipped';

    const body: Record<string, unknown> = {};
    if (plan.listing) {
      const matches = units.filter(
        (unit) =>
          String(unit.HostawayListingID ?? '').trim() === reservation.listingId,
      );
      body.HostawayListingID = reservation.listingId;
      body.Unit = matches.length === 1 ? matches[0]._id : null;
      if (
        reservation.listingName &&
        card.Description?.startsWith(DESCRIPTION_PREFIX)
      ) {
        body.Description = `${DESCRIPTION_PREFIX}${reservation.listingName}`;
      }
    }

    let planCleared = false;
    if (plan.date) {
      body.CheckoutDate = reservation.checkoutDate;
      const plannedDay = guayaquilDay(card.PlannedStartTime);
      if (
        plannedDay !== null &&
        plannedDay < (reservation.checkoutDate as string)
      ) {
        planCleared = true;
        body.Employee = null;
        body.PlannedStartTime = null;
        body.PlannedEndTime = null;
      }
    }

    try {
      await this.gateway.updateCleaningTask(taskId, body);
    } catch (error) {
      // Pudo aplicarse aunque no llegara la respuesta.
      const current = await this.readTask(taskId).catch(() => null);
      if (!current || !reflects(body, current)) throw error;
    }
    const baseline = this.baselineEntry(reservation, taskId);
    if (baseline) await this.saveBaselines([baseline]);
    this.logger.log(
      `Limpieza actualizada: id=${taskId} reserva=${reservation.id} campos=${Object.keys(body).join(',')}`,
    );
    if (planCleared) {
      this.notify(taskId, snapshotOf(card), {
        employeeId: null,
        plannedStartTime: null,
        plannedEndTime: null,
      });
    }
    return 'updated';
  }

  private async cancel(
    reservation: Reservation,
    taskId: number,
  ): Promise<CleaningSyncAction> {
    // Provisional antes de escribir; solo cuenta como nuestra una vez confirmada.
    await this.cancellations.upsert(
      {
        taskId: String(taskId),
        reservationId: reservation.id,
        confirmed: false,
      },
      ['taskId'],
    );

    const card = await this.readTask(taskId);
    if (!card || !this.isWritable(card, reservation.id)) {
      // Cancelada por otro, empezada o ilegible: la marca no vale.
      await this.unmark(taskId);
      return card && isCancelled(card) ? 'unchanged' : 'skipped';
    }

    try {
      await this.gateway.updateCleaningTask(taskId, {
        phase: PHASE_IDS.CANCELLED,
        Notes: CANCEL_REASON,
      });
    } catch (error) {
      const current = await this.readTask(taskId).catch(() => null);
      // Abierta o ilegible: la marca queda provisional y la próxima pasada reintenta.
      if (!current || !isCancelled(current)) throw error;
      // La fuente no siempre devuelve `Notes`: vacío no prueba que fuera otra persona.
      const notes = current.Notes?.trim();
      if (notes && notes !== CANCEL_REASON) {
        await this.unmark(taskId);
        return 'skipped';
      }
    }
    await this.confirmMark(taskId);
    this.logger.log(
      `Limpieza cancelada: id=${taskId} reserva=${reservation.id} (reserva cancelada en Hostaway)`,
    );

    const before = snapshotOf(card);
    this.notify(taskId, before, { ...before, cancelled: true });
    await this.cancelSupervisions(taskId);
    return 'cancelled';
  }

  /** Si falla, la limpieza no se recreará al revivir la reserva: el lado seguro. */
  private async confirmMark(taskId: number): Promise<void> {
    try {
      await this.cancellations.update(
        { taskId: String(taskId) },
        { confirmed: true },
      );
      this.cancelledByPerson.clear();
    } catch (error) {
      this.logger.warn(
        `No se pudo confirmar la marca de la limpieza ${taskId} — ${describeError(error)}`,
      );
    }
  }

  private async unmark(taskId: number): Promise<void> {
    try {
      await this.cancellations.delete({ taskId: String(taskId) });
    } catch (error) {
      this.logger.warn(
        `No se pudo retirar la marca de la limpieza ${taskId} — ${describeError(error)}`,
      );
    }
  }

  private async cancelSupervisions(taskId: number): Promise<void> {
    try {
      await withTimeout(
        this.supervisions.cancelOpenForTask(taskId),
        CALL_TIMEOUT_MS,
        'Cancelación de supervisiones',
      );
    } catch (error) {
      this.logger.warn(
        `No se pudieron cancelar las supervisiones de la limpieza ${taskId} — ${describeError(error)}`,
      );
    }
  }

  private notify(
    taskId: number,
    before: CleaningPlanSnapshot,
    after: CleaningPlanSnapshot,
  ): void {
    try {
      this.notices.record(taskId, before, after);
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar del cambio en la limpieza ${taskId} — ${describeError(error)}`,
      );
    }
  }

  private async readTask(taskId: number): Promise<CleaningTaskCard | null> {
    const response = await withTimeout(
      this.gateway.getTaskByIdWithSession(taskId),
      CALL_TIMEOUT_MS,
      `Lectura de la limpieza ${taskId}`,
    );
    return response?.data ?? null;
  }

  /** `null`: ya empezó, se canceló o dejó de ser de esta reserva. */
  private async rereadUnstarted(
    reservationId: string,
    taskId: number,
  ): Promise<CleaningTaskCard | null> {
    const card = await this.readTask(taskId);
    if (card && this.isWritable(card, reservationId)) return card;
    this.logger.debug(
      `La limpieza ${taskId} cambió mientras se sincronizaba: no se toca`,
    );
    return null;
  }

  private isWritable(card: CleaningTaskCard, reservationId: string): boolean {
    return isUnstartedTask(card) && reservationOf(card) === reservationId;
  }

  // ─── Línea base ───────────────────────────────────────────────────────────

  /** Nada que guardar sin listing si se ignora el de la base. */
  private baselineEntry(
    reservation: Reservation,
    taskId: number,
  ): BaselineEntry | undefined {
    const cached = this.baselines.get(taskId);
    if (
      reservation.checkoutDate === null ||
      (!reservation.listingId && cached === undefined)
    ) {
      return undefined;
    }
    return {
      taskId,
      base: {
        date: reservation.checkoutDate,
        listing: reservation.listingId || (cached?.listing ?? ''),
      },
    };
  }

  /** Lanza si no se puede leer: sin la base no se escribe. */
  private async baselineOf(taskId: number): Promise<Baseline | null> {
    if (!this.baselines.has(taskId)) await this.loadBaselines([taskId]);
    return this.baselines.get(taskId) ?? null;
  }

  private async preloadBaselines(tasks: CleaningTaskCard[]): Promise<void> {
    const ids = tasks
      .map((task) => task._id)
      .filter((id) => !this.baselines.has(id));
    if (ids.length === 0) return;
    try {
      await this.loadBaselines(ids);
    } catch (error) {
      this.logger.warn(
        `No se pudo cargar la línea base de las limpiezas — ${describeError(error)}`,
      );
    }
  }

  private async loadBaselines(taskIds: number[]): Promise<void> {
    const rows = await this.baselineRows.find({
      where: { taskId: In(taskIds.map(String)) },
    });
    const byId = new Map(rows.map((row) => [Number(row.taskId), row]));
    for (const id of taskIds) {
      const row = byId.get(id);
      this.cacheBaseline(
        id,
        row
          ? { date: row.checkoutDate, listing: row.listingId, saved: true }
          : null,
      );
    }
  }

  /** Nunca lanza: lo que no se pudo guardar queda en memoria y se reintenta. */
  private async saveBaselines(entries: BaselineEntry[]): Promise<void> {
    const changed = entries.filter(({ taskId, base }) => {
      const cached = this.baselines.get(taskId);
      return !(
        cached?.saved &&
        cached.date === base.date &&
        cached.listing === base.listing
      );
    });
    if (changed.length === 0) return;

    let saved = true;
    try {
      await this.baselineRows.upsert(
        changed.map(({ taskId, base }) => ({
          taskId: String(taskId),
          checkoutDate: base.date,
          listingId: base.listing,
        })),
        ['taskId'],
      );
    } catch (error) {
      saved = false;
      this.logger.warn(
        `No se pudo guardar la línea base de ${changed.length} limpieza(s) — ${describeError(error)}`,
      );
    }
    for (const { taskId, base } of changed) {
      this.cacheBaseline(taskId, { ...base, saved });
    }
  }

  private cacheBaseline(taskId: number, value: CachedBaseline | null): void {
    this.baselines.delete(taskId);
    if (this.baselines.size >= MAX_BASELINES) {
      const [oldest] = this.baselines.keys();
      if (oldest !== undefined) this.baselines.delete(oldest);
    }
    this.baselines.set(taskId, value);
  }

  // ─── Colas y configuración ────────────────────────────────────────────────

  private enqueueSignal(id: string): void {
    if (this.stopped) return;
    this.pending.set(id, null);
    this.signalQueue = this.signalQueue.then(async () => {
      this.pending.delete(id);
      if (this.stopped) return;
      try {
        await this.reconcileReservation(id);
      } catch (error) {
        this.logger.warn(
          `No se pudo atender el cambio de la reserva ${id}; lo recoge el barrido — ${describeError(error)}`,
        );
      }
    });
  }

  private exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const current = previous.then(work, work);
    const settled = current
      .catch(() => undefined)
      .then(() => {
        if (this.queues.get(id) === settled) this.queues.delete(id);
      });
    this.queues.set(id, settled);
    return current;
  }

  private enabled(): boolean {
    return (
      this.configService.get<string>('HOSTAWAY_SCHEDULER_ENABLED') === 'true'
    );
  }

  private windowDays(): number {
    const raw = String(
      this.configService.get<string>('HOSTAWAY_SYNC_DAYS') ?? '',
    ).trim();
    const days = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    return days >= 1 && days <= MAX_DAYS ? days : DEFAULT_DAYS;
  }

  private window(): Window {
    const from = guayaquilToday();
    return { from, to: addDays(from, this.windowDays() - 1) };
  }

  private emptyResult(window: Window): CleaningSyncRunResult {
    return {
      dateFrom: window.from,
      dateTo: window.to,
      created: 0,
      updated: 0,
      cancelled: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
    };
  }

  private checkoutTime(value: string | number | null): string {
    const text = String(value ?? 11);
    return text.includes(':') ? text : `${text.padStart(2, '0')}:00`;
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.remember(this.warned, key);
    this.logger.warn(message);
  }

  private remember(set: Set<string>, key: string): void {
    if (set.size >= MAX_REMEMBERED) set.clear();
    set.add(key);
  }
}
