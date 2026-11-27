import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { once, withTimeout } from '../../common/integrations/async.util';
import { safeActor } from '../../common/integrations/safe-actor.util';
import { requireList } from '../../common/integrations/upstream.util';
import { describeError } from '../../common/logging/describe-error.util';
import { CleaningNoticesService } from './cleaning-notices.service';
import type {
  CleanerAgenda,
  CleanerCleaning,
  CleaningBatchResult,
  CleaningChecklistOption,
  CleaningOverlap,
  CleaningPlanChange,
  CleaningPlanFields,
  CleaningPlanningContract,
  CleaningPlanResult,
  CleaningPlanSnapshot,
  CleaningPlanWarning,
} from './cleaning-planning.types';
import { CleaningReadService } from './cleaning-read.service';
import type { CleaningReadItem } from './cleaning-read.types';
import { CleaningSupervisionsService } from './cleaning-supervisions.service';
import {
  CleaningTaskCard,
  CleaningTasksOpenmaintService,
  EmployeeCard,
} from './cleaning-tasks.openmaint.service';
import {
  isPausedTask,
  resolveSessionStartedAt,
} from './cleaning-tasks.service';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';
import { PHASE_IDS, PHASE_NAMES } from './constants/phase.constants';
import { SUPERVISION_TEMPLATE_CODE } from './constants/supervision.constants';

/** Plazo de una operación; en un lote, pasado este tiempo no empieza cambios nuevos. */
const OPERATION_TIMEOUT_MS = 45_000;
const READ_TIMEOUT_MS = 20_000;
const BEST_EFFORT_TIMEOUT_MS = 10_000;
const CONFIRM_TIMEOUT_MS = 8_000;
const MAX_CONCURRENCY = 5;
const AGENDA_PAGE = 200;
const AGENDA_MAX = 2000;

const ASSIGNED = PHASE_NAMES[PHASE_IDS.ASSIGNED];
const IN_EXECUTION = PHASE_NAMES[PHASE_IDS.IN_EXECUTION];
const CANCELLED = PHASE_NAMES[PHASE_IDS.CANCELLED];
const OPEN_PHASES = [ASSIGNED, IN_EXECUTION];
const CLOSED_PHASES = [
  PHASE_NAMES[PHASE_IDS.COMPLETED],
  PHASE_NAMES[PHASE_IDS.REVIEWED],
  CANCELLED,
];

const FIELD_NAMES: ReadonlyArray<keyof CleaningPlanFields> = [
  'employeeId',
  'plannedStartTime',
  'plannedEndTime',
  'checklistId',
  'unitId',
  'observations',
  'checkoutDate',
  'description',
];

const WRITE_TIMEOUT_MESSAGE =
  'El cambio tardó demasiado y puede haberse guardado: comprobar antes de repetir';
const READ_TIMEOUT_MESSAGE = 'La consulta de limpiezas tardó demasiado';

/** Se agotó el plazo de la operación antes de empezar a escribir. */
class PlanDeadlineException extends GatewayTimeoutException {
  constructor() {
    super(WRITE_TIMEOUT_MESSAGE);
  }
}

/** Lo que importa de una limpieza para planificarla. */
type PlanState = {
  id: number;
  description: string | null;
  phase: string;
  isPaused: boolean;
  employeeId: number | null;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
  actualStartTime: string | null;
  /** Arranque de la ejecución en curso: al reabrir, `actualStartTime` es el primero. */
  sessionStartedAt: string | null;
  checkoutDate: string | null;
  unitId: number | null;
};

type Plan = {
  body: Record<string, unknown>;
  changed: string[];
  before: PlanState;
  after: PlanState;
};

type Interval = { start: number; end: number };

/** Datos compartidos de una operación: cada uno se lee como mucho una vez. */
type PlanContext = {
  deadline: number;
  team: () => Promise<EmployeeCard[]>;
  checklists: () => Promise<CleaningChecklistOption[]>;
  unitExists: (id: number) => Promise<boolean>;
  agenda: () => Promise<PlanState[]>;
};

type BatchEntry = {
  id: number;
  fields: CleaningPlanFields;
  plan?: Plan;
  result?: CleaningBatchResult;
};

/** 404 o 400 de la fuente; una página HTML es de un proxy caído. */
const isMissing = (error: unknown): boolean => {
  const response = (
    error as { response?: { status?: number; data?: unknown } } | null
  )?.response;
  const html =
    typeof response?.data === 'string' &&
    response.data.trimStart().startsWith('<');
  return (response?.status === 404 || response?.status === 400) && !html;
};

/** Sin descripción la fase llega como id interno. */
const phaseOf = (card: CleaningTaskCard): string => {
  const value = String(card._phase_description || card.phase);
  if (!/^\d+$/.test(value)) return value;
  return (PHASE_NAMES as Record<string, string>)[value] ?? 'Unknown';
};

/** La fuente puede devolver los ids como texto. */
const toId = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);

const toState = (card: CleaningTaskCard): PlanState => {
  const phase = phaseOf(card);
  return {
    id: Number(card._id),
    description: card.Description ?? null,
    phase,
    isPaused: isPausedTask({ ...card, _phase_description: phase }),
    employeeId: toId(card.Employee),
    plannedStartTime: card.PlannedStartTime ?? null,
    plannedEndTime: card.PlannedEndTime ?? null,
    actualStartTime: card.ActualStartTime ?? null,
    sessionStartedAt: resolveSessionStartedAt({
      ...card,
      _phase_description: phase,
    }),
    checkoutDate: card.CheckoutDate?.slice(0, 10) ?? null,
    unitId: toId(card.Unit),
  };
};

/** Segundos: la fuente no conserva los milisegundos. `null` = sin fecha. */
const toSeconds = (value: string | null | undefined): number | null => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
};

const toTime = (value: string | null): number =>
  value ? Date.parse(value) : NaN;

const isOpen = (state: PlanState): boolean => OPEN_PHASES.includes(state.phase);

const plannedInterval = (state: PlanState): Interval | null => {
  const start = toTime(state.plannedStartTime);
  const end = toTime(state.plannedEndTime);
  return end > start ? { start, end } : null;
};

/** Inicio de la ejecución en curso; sin sesión conocida, el mayor entre real y planeado. */
const runningStart = (state: PlanState, now: number): number => {
  const session = toTime(state.sessionStartedAt);
  const starts = Number.isNaN(session)
    ? [toTime(state.actualStartTime), toTime(state.plannedStartTime)]
    : [session];
  const known = starts.filter((time) => !Number.isNaN(time));
  return known.length > 0 ? Math.min(Math.max(...known), now) : NaN;
};

/** Tiempo que ocupa al operario, [inicio, fin). */
const intervalOf = (state: PlanState): Interval | null => {
  if (state.phase !== IN_EXECUTION) return plannedInterval(state);
  const now = Date.now();
  const start = runningStart(state, now);
  const plannedEnd = toTime(state.plannedEndTime);
  const end = plannedEnd > now ? plannedEnd : now;
  return end > start ? { start, end } : null;
};

const intersects = (a: Interval, b: Interval): boolean =>
  a.start < b.end && b.start < a.end;

const byStart = (a: PlanState, b: PlanState): number => {
  const startOf = (state: PlanState) =>
    intervalOf(state)?.start ??
    (toTime(state.plannedStartTime) || Number.MAX_SAFE_INTEGER);
  return startOf(a) - startOf(b) || a.id - b.id;
};

const toOverlap = (state: PlanState): CleaningOverlap => ({
  id: state.id,
  description: state.description,
  phase: state.phase,
  plannedStartTime: state.plannedStartTime,
  plannedEndTime: state.plannedEndTime,
});

const toCleanerCleaning = (state: PlanState): CleanerCleaning => ({
  ...toOverlap(state),
  isPaused: state.isPaused,
  actualStartTime: state.actualStartTime,
  checkoutDate: state.checkoutDate,
  unitId: state.unitId,
});

const toSnapshot = (state: PlanState): CleaningPlanSnapshot => ({
  employeeId: state.employeeId,
  plannedStartTime: state.plannedStartTime,
  plannedEndTime: state.plannedEndTime,
});

const toIsoSeconds = (
  value: string | null,
  label: string,
): { iso: string | null; seconds: number | null } => {
  if (value === null) return { iso: null, seconds: null };
  const seconds = toSeconds(value);
  if (seconds === null) {
    throw new BadRequestException(`${label} no es una fecha válida`);
  }
  return { iso: new Date(seconds * 1000).toISOString(), seconds };
};

/** Lo que se puede rechazar sin leer la limpieza. */
const assertFields = (fields: CleaningPlanFields): void => {
  if (FIELD_NAMES.every((name) => fields[name] === undefined)) {
    throw new BadRequestException('No hay nada que actualizar');
  }
  if (fields.description !== undefined && !fields.description?.trim()) {
    throw new BadRequestException('La descripción no puede quedar vacía');
  }
};

/** Solo lo que cambia respecto de la tarjeta leída. */
const buildPlan = (
  card: CleaningTaskCard,
  fields: CleaningPlanFields,
): Plan => {
  const before = toState(card);
  const after = { ...before };
  const body: Record<string, unknown> = {};
  const changed: string[] = [];
  const set = (name: string, attribute: string, value: unknown) => {
    body[attribute] = value;
    changed.push(name);
  };

  if (
    fields.employeeId !== undefined &&
    fields.employeeId !== before.employeeId
  ) {
    set('employeeId', 'Employee', fields.employeeId);
    after.employeeId = fields.employeeId;
  }
  if (fields.plannedStartTime !== undefined) {
    const next = toIsoSeconds(fields.plannedStartTime, 'plannedStartTime');
    if (next.seconds !== toSeconds(before.plannedStartTime)) {
      set('plannedStartTime', 'PlannedStartTime', next.iso);
      after.plannedStartTime = next.iso;
    }
  }
  if (fields.plannedEndTime !== undefined) {
    const next = toIsoSeconds(fields.plannedEndTime, 'plannedEndTime');
    if (next.seconds !== toSeconds(before.plannedEndTime)) {
      set('plannedEndTime', 'PlannedEndTime', next.iso);
      after.plannedEndTime = next.iso;
    }
  }
  if (
    fields.checklistId !== undefined &&
    fields.checklistId !== toId(card.CleaningChecklist)
  ) {
    set('checklistId', 'CleaningChecklist', fields.checklistId);
  }
  if (fields.unitId !== undefined && fields.unitId !== before.unitId) {
    set('unitId', 'Unit', fields.unitId);
    after.unitId = fields.unitId;
  }
  if (fields.observations !== undefined) {
    const next = fields.observations?.trim() || null;
    if (next !== (card.Observations?.trim() || null)) {
      set('observations', 'Observations', next);
    }
  }
  if (fields.checkoutDate !== undefined) {
    const next = fields.checkoutDate;
    if (next.slice(0, 10) !== (before.checkoutDate ?? '')) {
      set('checkoutDate', 'CheckoutDate', next);
      after.checkoutDate = next;
    }
  }
  if (fields.description !== undefined) {
    const next = fields.description.trim();
    if (next !== before.description?.trim()) {
      set('description', 'Description', next);
      after.description = next;
    }
  }

  if ('PlannedStartTime' in body || 'PlannedEndTime' in body) {
    const start = toSeconds(after.plannedStartTime);
    const end = toSeconds(after.plannedEndTime);
    if (start !== null && end !== null && end <= start) {
      throw new BadRequestException(
        'El fin planificado debe ser posterior al inicio',
      );
    }
  }
  return { body, changed, before, after };
};

/** La tarjeta ya tiene todo lo que el plan quería escribir. */
const reflects = (
  card: CleaningTaskCard,
  fields: CleaningPlanFields,
  plan: Plan,
): boolean => {
  const written = Object.fromEntries(
    Object.entries(fields).filter(([name]) => plan.changed.includes(name)),
  );
  return buildPlan(card, written).changed.length === 0;
};

/**
 * Planificación de limpiezas para integraciones, con la sesión de servicio.
 * Nunca escribe la fase (salvo cancelar) ni los tiempos reales.
 */
@Injectable()
export class CleaningPlanningService implements CleaningPlanningContract {
  private readonly logger = new Logger(CleaningPlanningService.name);
  /** Última escritura en cola de cada limpieza. */
  private readonly locks = new Map<number, Promise<void>>();

  constructor(
    private readonly gateway: CleaningTasksOpenmaintService,
    private readonly reader: CleaningReadService,
    private readonly supervisions: CleaningSupervisionsService,
    private readonly session: CleaningTasksSessionService,
    private readonly config: ConfigService,
    private readonly notices: CleaningNoticesService,
  ) {}

  async update(
    id: number,
    fields: CleaningPlanFields,
    actor: string,
  ): Promise<CleaningPlanResult> {
    assertFields(fields);
    return this.run(`update ${id}`, WRITE_TIMEOUT_MESSAGE, async (context) => {
      const { plan, warnings } = await this.exclusive(id, () =>
        this.apply(id, fields, actor, context),
      );
      return {
        id,
        result: plan.changed.length > 0 ? 'applied' : 'unchanged',
        warnings,
        data: await this.readItem(id, context),
      };
    });
  }

  async cancel(
    id: number,
    reason: string,
    actor: string,
  ): Promise<CleaningPlanResult> {
    const notes = reason?.trim();
    if (!notes) throw new BadRequestException('El motivo es obligatorio');

    return this.run(`cancel ${id}`, WRITE_TIMEOUT_MESSAGE, async (context) => {
      const { state, applied } = await this.exclusive(id, async () => {
        const before = toState(await this.requireTask(id, context));
        if (before.phase === CANCELLED) {
          return { state: before, applied: false };
        }
        if (!isOpen(before)) {
          throw new ConflictException(
            `La limpieza está en fase ${before.phase} y no se puede cancelar`,
          );
        }
        await this.write(
          id,
          { phase: PHASE_IDS.CANCELLED, Notes: notes },
          context,
          (card) => phaseOf(card) === CANCELLED,
        );
        this.logger.log(
          `Limpieza ${id}: cancelada por ${safeActor(actor)}, estaba en ${before.phase} con operario ${before.employeeId ?? 'ninguno'}`,
        );
        this.notify(id, toSnapshot(before), {
          ...toSnapshot(before),
          cancelled: true,
        });
        await this.bestEffort(
          `No se pudieron anular las supervisiones de la limpieza ${id}`,
          () => this.supervisions.cancelOpenForTask(id),
          context,
        );
        return { state: { ...before, phase: CANCELLED }, applied: true };
      });
      return {
        id,
        result: applied ? 'applied' : 'unchanged',
        warnings: await this.warningsOf(state, context),
        data: await this.readItem(id, context),
      };
    });
  }

  /** Un dato común ilegible (equipo, agenda) hace fallar solo los cambios que lo necesitan. */
  async batch(
    changes: CleaningPlanChange[],
    options: { dryRun: boolean; actor: string },
  ): Promise<CleaningBatchResult[]> {
    if (new Set(changes.map(({ id }) => id)).size !== changes.length) {
      throw new BadRequestException('Hay limpiezas repetidas en el lote');
    }
    const context = this.newContext();
    await this.assertSession();

    const entries = changes.map(
      ({ id, ...fields }): BatchEntry => ({
        id,
        fields,
      }),
    );
    const queue = [...entries];
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        try {
          assertFields(entry.fields);
          const card = await this.requireTask(entry.id, context);
          entry.plan = await this.prepare(card, entry.fields, context);
        } catch (error) {
          entry.result = this.toFailure(entry.id, error);
        }
      }
    };
    await Promise.all(Array.from({ length: MAX_CONCURRENCY }, worker));

    // Cómo quedan las limpiezas del lote: es contra lo que se miran los cruces.
    const overlay = new Map<number, PlanState>();
    for (const { id, plan } of entries) {
      if (plan) overlay.set(id, plan.after);
    }
    for (const entry of entries) {
      const { id, plan } = entry;
      if (!plan) continue;
      try {
        const warnings = await this.warningsOf(plan.after, context, overlay);
        if (plan.changed.length === 0) {
          entry.result = { id, result: 'unchanged', warnings, error: null };
        } else if (options.dryRun) {
          entry.result = { id, result: 'valid', warnings, error: null };
        }
      } catch (error) {
        entry.result = this.toFailure(id, error);
        overlay.delete(id);
      }
    }

    for (const entry of entries) {
      if (entry.result) continue;
      const { id, fields } = entry;
      try {
        const { plan, warnings } = await this.exclusive(id, () =>
          this.apply(id, fields, options.actor, context, overlay),
        );
        overlay.set(id, plan.after);
        entry.plan = plan;
        entry.result = {
          id,
          result: plan.changed.length > 0 ? 'applied' : 'unchanged',
          warnings,
          error: null,
        };
      } catch (error) {
        entry.result = this.toFailure(id, error);
        overlay.delete(id);
      }
    }

    // Lo que no se guardó deja de contar para los cruces de los demás.
    const results: CleaningBatchResult[] = [];
    for (const { plan, result } of entries) {
      if (plan && result && overlay.has(plan.after.id)) {
        result.warnings = await this.warningsOf(
          plan.after,
          context,
          overlay,
        ).catch(() => result.warnings);
      }
      if (result) results.push(result);
    }
    return results;
  }

  async listCleaners(from: string, to: string): Promise<CleanerAgenda[]> {
    const range = { start: Date.parse(from), end: Date.parse(to) };
    if (!(range.end > range.start)) {
      throw new BadRequestException('El rango de fechas no es válido');
    }
    return this.run('listCleaners', READ_TIMEOUT_MESSAGE, async (context) => {
      const [team, agenda] = await Promise.all([
        context.team(),
        context.agenda(),
      ]);
      return team
        .map((employee) => this.toAgenda(employee, agenda, range))
        .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id - b.id);
    });
  }

  async listChecklists(): Promise<CleaningChecklistOption[]> {
    return this.run('listChecklists', READ_TIMEOUT_MESSAGE, (context) =>
      context.checklists(),
    );
  }

  // ─── Cambios ────────────────────────────────────────────────────────────────

  /** Lee, valida y escribe. Siempre dentro de `exclusive`. */
  private async apply(
    id: number,
    fields: CleaningPlanFields,
    actor: string,
    context: PlanContext,
    overlay?: Map<number, PlanState>,
  ): Promise<{ plan: Plan; warnings: CleaningPlanWarning[] }> {
    const card = await this.requireTask(id, context);
    const plan = await this.prepare(card, fields, context);
    const warnings = await this.warningsOf(plan.after, context, overlay);
    if (plan.changed.length === 0) return { plan, warnings };

    await this.write(id, plan.body, context, (saved) =>
      reflects(saved, fields, plan),
    );

    const { before, after, changed } = plan;
    this.logger.log(
      `Limpieza ${id}: planificación cambiada por ${safeActor(actor)}, ` +
        `operario ${before.employeeId ?? 'ninguno'} → ${after.employeeId ?? 'ninguno'}, ` +
        `inicio ${before.plannedStartTime ?? 'ninguno'} → ${after.plannedStartTime ?? 'ninguno'}, ` +
        `fin ${before.plannedEndTime ?? 'ninguno'} → ${after.plannedEndTime ?? 'ninguno'}, ` +
        `campos=${changed.join(',')}`,
    );
    const noticeable = ['Employee', 'PlannedStartTime', 'PlannedEndTime'];
    if (isOpen(after) && noticeable.some((name) => name in plan.body)) {
      this.notify(id, toSnapshot(before), toSnapshot(after));
    }
    return { plan, warnings };
  }

  /** Calcula el cambio y comprueba que lo que referencia exista. */
  private async prepare(
    card: CleaningTaskCard,
    fields: CleaningPlanFields,
    context: PlanContext,
  ): Promise<Plan> {
    const plan = buildPlan(card, fields);
    const { Employee, CleaningChecklist, Unit } = plan.body as {
      Employee?: number | null;
      CleaningChecklist?: number | null;
      Unit?: number | null;
    };

    if (
      Employee != null &&
      !(await context.team()).some((e) => e._id === Employee)
    ) {
      throw new BadRequestException(
        'El operario no pertenece al equipo de limpieza',
      );
    }
    if (
      CleaningChecklist != null &&
      !(await context.checklists()).some((c) => c.id === CleaningChecklist)
    ) {
      throw new BadRequestException(
        'El checklist no existe o no se puede asignar',
      );
    }
    if (Unit != null && !(await context.unitExists(Unit))) {
      throw new BadRequestException('La unidad no existe');
    }
    return plan;
  }

  /** Avisos sobre cómo queda la limpieza. La agenda se lee solo si hace falta. */
  private async warningsOf(
    state: PlanState,
    context: PlanContext,
    overlay?: Map<number, PlanState>,
  ): Promise<CleaningPlanWarning[]> {
    const warnings: CleaningPlanWarning[] = [];
    if (CLOSED_PHASES.includes(state.phase)) warnings.push({ code: 'closed' });
    if (
      state.phase === IN_EXECUTION ||
      state.isPaused ||
      (state.phase === ASSIGNED && state.actualStartTime)
    ) {
      warnings.push({ code: 'started' });
    }
    if (!isOpen(state) || state.employeeId === null) return warnings;

    if (!plannedInterval(state)) {
      warnings.push({ code: 'no_schedule' });
      return warnings;
    }
    const agenda = await context.agenda();
    const interval = intervalOf(state);
    const cleanings = [
      ...agenda.filter(({ id }) => !overlay?.has(id)),
      ...(overlay?.values() ?? []),
    ]
      .filter((other) => {
        const busy = intervalOf(other);
        return (
          other.id !== state.id &&
          other.employeeId === state.employeeId &&
          isOpen(other) &&
          interval !== null &&
          busy !== null &&
          intersects(interval, busy)
        );
      })
      .sort(byStart)
      .map(toOverlap);
    if (cleanings.length > 0) warnings.push({ code: 'overlap', cleanings });
    return warnings;
  }

  /** Pasado el plazo no se empieza a escribir. Tras un fallo se mira si se guardó igual. */
  private async write(
    id: number,
    body: Record<string, unknown>,
    context: PlanContext,
    isSaved: (card: CleaningTaskCard) => boolean,
  ): Promise<void> {
    if (Date.now() >= context.deadline) throw new PlanDeadlineException();
    try {
      await this.gateway.updateCleaningTask(id, body);
    } catch (error) {
      this.logger.error(
        `No se pudo guardar la limpieza ${id} — ${describeError(error)}`,
      );
      if (this.session.isCoolingDown()) throw this.unavailable();
      if (await this.confirmSaved(id, isSaved)) return;
      throw new BadGatewayException(
        'No se pudo confirmar el cambio en la fuente de datos: comprobar antes de repetir',
      );
    }
  }

  /** Una respuesta perdida no es un cambio perdido: repetirlo daría `unchanged` sin aviso. */
  private async confirmSaved(
    id: number,
    isSaved: (card: CleaningTaskCard) => boolean,
  ): Promise<boolean> {
    try {
      const response = await withTimeout(
        this.gateway.getTaskByIdWithSession(id),
        CONFIRM_TIMEOUT_MS,
        () => new Error('sin respuesta a tiempo'),
      );
      return Boolean(response?.data) && isSaved(response.data);
    } catch (error) {
      this.logger.warn(
        `No se pudo comprobar si se guardó la limpieza ${id} — ${describeError(error)}`,
      );
      return false;
    }
  }

  private notify(
    id: number,
    before: CleaningPlanSnapshot,
    after: CleaningPlanSnapshot,
  ): void {
    try {
      this.notices.record(id, before, after);
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar el aviso de la limpieza ${id} — ${describeError(error)}`,
      );
    }
  }

  /** Las escrituras de una misma limpieza van una tras otra; gana la última. */
  private async exclusive<T>(id: number, work: () => Promise<T>): Promise<T> {
    const running = (this.locks.get(id) ?? Promise.resolve()).then(work);
    const tail = running.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(id, tail);
    try {
      return await running;
    } finally {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    }
  }

  // ─── Lecturas ───────────────────────────────────────────────────────────────

  private newContext(): PlanContext {
    const deadline = Date.now() + OPERATION_TIMEOUT_MS;
    const units = new Map<number, () => Promise<boolean>>();
    return {
      deadline,
      team: once(async () => {
        const teamId = this.cleaningTeamId();
        return this.source('el equipo de limpieza', deadline, async () =>
          requireList(await this.gateway.listEmployees(teamId)).map((e) => ({
            ...e,
            _id: Number(e._id),
          })),
        );
      }),
      checklists: once(async () => {
        const options = await this.source('los checklists', deadline, () =>
          this.gateway.listChecklistOptions(),
        );
        return options.filter(
          ({ code }) => code?.trim() !== SUPERVISION_TEMPLATE_CODE,
        );
      }),
      unitExists: (id) => {
        const load =
          units.get(id) ??
          once(() =>
            this.source(`la unidad ${id}`, deadline, async () => {
              const response = await this.gateway
                .getUnitByIdWithSession(id)
                .catch((error: unknown) => {
                  if (isMissing(error)) return null;
                  throw error;
                });
              return Boolean(response?.data);
            }),
          );
        units.set(id, load);
        return load();
      },
      agenda: once(() => this.readAgenda(deadline)),
    };
  }

  /** Limpiezas abiertas con operario. */
  private async readAgenda(deadline: number): Promise<PlanState[]> {
    const [assigned, inExecution] = await Promise.all(
      OPEN_PHASES.map((phase) => this.readPhase(phase, deadline)),
    );
    const byId = new Map<number, PlanState>();
    for (const card of [...assigned, ...inExecution]) {
      const state = toState(card);
      byId.set(state.id, state);
    }
    return [...byId.values()];
  }

  private async readPhase(
    phase: string,
    deadline: number,
  ): Promise<CleaningTaskCard[]> {
    const cards: CleaningTaskCard[] = [];
    for (let offset = 0; ; offset += AGENDA_PAGE) {
      const page = await this.source('la agenda', deadline, async () => {
        // Una agenda cortada haría pasar por libre a quien no lo está.
        if (offset >= AGENDA_MAX) throw new Error('la agenda superó el tope');
        return requireList(
          await this.gateway.getAllTasks({
            phase,
            assigned: true,
            limit: AGENDA_PAGE,
            offset,
            sort: 'newest',
          }),
        );
      });
      cards.push(...page);
      if (page.length < AGENDA_PAGE) return cards;
    }
  }

  private async requireTask(
    id: number,
    context: PlanContext,
  ): Promise<CleaningTaskCard> {
    const response = await this.source(
      `la limpieza ${id}`,
      context.deadline,
      () =>
        this.gateway.getTaskByIdWithSession(id).catch((error: unknown) => {
          if (isMissing(error)) return null;
          throw error;
        }),
    );
    if (!response?.data) {
      throw new NotFoundException(`Limpieza ${id} no encontrada`);
    }
    return response.data;
  }

  private readItem(
    id: number,
    context: PlanContext,
  ): Promise<CleaningReadItem | null> {
    return this.bestEffort(
      `No se pudo releer la limpieza ${id}`,
      () => this.reader.item(id),
      context,
    );
  }

  private toAgenda(
    employee: EmployeeCard,
    agenda: PlanState[],
    range: Interval,
  ): CleanerAgenda {
    const own = agenda
      .filter((state) => state.employeeId === employee._id && isOpen(state))
      .sort(byStart);
    const running = own.filter((state) => state.phase === IN_EXECUTION);
    const cleanings = own.filter((state) => {
      if (state.phase === IN_EXECUTION) return true;
      const interval = intervalOf(state);
      return interval !== null && intersects(interval, range);
    });
    const plannedMs = cleanings.reduce((total, state) => {
      const planned = plannedInterval(state);
      if (!planned || !intersects(planned, range)) return total;
      return (
        total +
        Math.min(planned.end, range.end) -
        Math.max(planned.start, range.start)
      );
    }, 0);
    return {
      id: employee._id,
      name: employee.Description ?? '',
      inExecutionId: running.at(-1)?.id ?? null,
      plannedMinutes: Math.round(plannedMs / 60_000),
      cleanings: cleanings.map(toCleanerCleaning),
      unscheduled: own
        .filter(
          (state) => state.phase !== IN_EXECUTION && !plannedInterval(state),
        )
        .map(toCleanerCleaning),
    };
  }

  private cleaningTeamId(): number {
    const value = Number(this.config.get<string>('OPENMAINT_CLEANING_TEAM_ID'));
    if (!Number.isInteger(value) || value <= 0) {
      throw new ServiceUnavailableException(
        'El equipo de limpieza no está configurado',
      );
    }
    return value;
  }

  // ─── Plazo, sesión y errores ────────────────────────────────────────────────

  private async run<T>(
    operation: string,
    timeoutMessage: string,
    work: (context: PlanContext) => Promise<T>,
  ): Promise<T> {
    const context = this.newContext();
    try {
      return await withTimeout(
        this.assertSession().then(() => work(context)),
        OPERATION_TIMEOUT_MS,
        () => new PlanDeadlineException(),
      );
    } catch (error) {
      if (error instanceof PlanDeadlineException) {
        this.logger.error(`${operation} — plazo agotado`);
        throw new GatewayTimeoutException(timeoutMessage);
      }
      throw this.toHttp(operation, error);
    }
  }

  /** Lectura de la fuente: cualquier fallo sale como 502 (o 503 en enfriamiento). */
  private async source<T>(
    what: string,
    deadline: number,
    read: () => Promise<T>,
  ): Promise<T> {
    const left = deadline - Date.now();
    if (left <= 0) throw new PlanDeadlineException();
    try {
      return await withTimeout(read(), Math.min(left, READ_TIMEOUT_MS), () =>
        left <= READ_TIMEOUT_MS
          ? new PlanDeadlineException()
          : new Error('sin respuesta a tiempo'),
      );
    } catch (error) {
      if (error instanceof PlanDeadlineException) throw error;
      this.logger.error(`No se pudo leer ${what} — ${describeError(error)}`);
      if (this.session.isCoolingDown()) throw this.unavailable();
      throw new BadGatewayException(
        'No se pudo leer la información de limpiezas en la fuente de datos',
      );
    }
  }

  /** Tras guardar: ni su fallo ni su demora cambian el resultado. */
  private async bestEffort<T>(
    failure: string,
    work: () => Promise<T>,
    context: PlanContext,
  ): Promise<T | null> {
    const left = context.deadline - Date.now() - 1000;
    try {
      return await withTimeout(
        work(),
        Math.min(Math.max(left, 1), BEST_EFFORT_TIMEOUT_MS),
        () => new Error('sin respuesta a tiempo'),
      );
    } catch (error) {
      this.logger.warn(`${failure} — ${describeError(error)}`);
      return null;
    }
  }

  private async assertSession(): Promise<void> {
    if (this.session.isCoolingDown()) throw this.unavailable();
    if (!(await this.session.getSessionId())) throw this.unavailable();
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'La planificación de limpiezas no está disponible por el momento',
    );
  }

  /** Aquí solo llegan errores propios; otro sería un fallo nuestro y no se expone. */
  private toHttp(operation: string, error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    this.logger.error(`${operation} — ${describeError(error)}`);
    return new BadGatewayException('No se pudo completar la operación');
  }

  private toFailure(id: number, error: unknown): CleaningBatchResult {
    if (error instanceof PlanDeadlineException) {
      return { id, result: 'not_attempted', warnings: [], error: null };
    }
    const http = this.toHttp(`batch ${id}`, error);
    return {
      id,
      result: 'failed',
      warnings: [],
      error: { statusCode: http.getStatus(), message: http.message },
    };
  }
}
