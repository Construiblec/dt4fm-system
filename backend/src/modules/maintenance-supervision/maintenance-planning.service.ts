import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { once, withTimeout } from '../../common/integrations/async.util';
import { safeActor } from '../../common/integrations/safe-actor.util';
import {
  isHtml,
  upstreamStatus,
} from '../../common/integrations/upstream.util';
import { describeError } from '../../common/logging/describe-error.util';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { CleaningTasksSessionService } from '../cleaning-tasks/cleaning-tasks.session.service';
import type { PreventiveMaintCard } from '../preventive-maintenance/preventive-maintenance.openmaint.service';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import type {
  FlowOutcome,
  FlowPlan,
  FlowStep,
  MaintenanceWriteFlow,
} from './flows/maintenance-flow.types';
import { PreventiveFlow } from './flows/preventive-flow';
import {
  loadMaintenanceEmployees,
  parseTeamIds,
} from './maintenance-employees.util';
import {
  NOTES_ALONE_MESSAGE,
  type MaintenanceBatchResult,
  MaintenanceEmployee,
  MaintenanceKind,
  MaintenancePlanChange,
  MaintenancePlanFields,
  MaintenancePlanningContract,
  MaintenancePlanResult,
  MaintenancePlanWarning,
  MaintenanceReadItem,
} from './maintenance-integration.types';
import { SUPPLIER_EMPLOYEE_TYPE } from './constants/supervision-roles.constants';
import { toSeconds } from './maintenance-rules';

/** Plazo de una operación; en un lote, pasado este tiempo no empieza cambios nuevos. */
const OPERATION_TIMEOUT_MS = 45_000;
const READ_TIMEOUT_MS = 20_000;
/** Una cadena de pasos no empieza con menos tiempo que este: nunca se corta a medias. */
const MIN_CHAIN_MS = 15_000;
const MAX_CONCURRENCY = 5;

const FIELD_NAMES: ReadonlyArray<keyof MaintenancePlanFields> = [
  'employeeId',
  'plannedStartTime',
  'notes',
];

const WRITE_TIMEOUT_MESSAGE =
  'El cambio tardó demasiado y puede haberse guardado: comprobar antes de repetir';
const NOUN: Record<MaintenanceKind, string> = {
  corrective: 'Correctivo',
  preventive: 'Preventivo',
};

/** Se agotó el plazo de la operación antes de empezar a escribir. */
class PlanDeadlineException extends GatewayTimeoutException {
  constructor() {
    super(WRITE_TIMEOUT_MESSAGE);
  }
}

/** El cambio se envió pero no se pudo comprobar si quedó guardado. */
class UnconfirmedException extends BadGatewayException {
  constructor() {
    super(
      'No se pudo confirmar el cambio en la fuente de datos: comprobar antes de repetir',
    );
  }
}

type Card = { _id: number };
type Flow = MaintenanceWriteFlow<Card>;

type Intent =
  | { type: 'update'; fields: MaintenancePlanFields }
  | { type: 'cancel'; reason: string };

type Applied = {
  applied: boolean;
  warnings: MaintenancePlanWarning[];
  /** La orden tal como se leyó por última vez. */
  card: Card;
};

type PlanContext = {
  deadline: number;
  employees: () => Promise<MaintenanceEmployee[]>;
  /** Si el empleado es un proveedor, leído de su ficha: una vez por empleado. */
  isSupplier: (employeeId: number) => Promise<boolean>;
};

type BatchEntry = {
  id: number;
  fields: MaintenancePlanFields;
  plan?: FlowPlan;
  result?: MaintenanceBatchResult;
};

const attr = (card: Card, name: string): unknown =>
  (card as Record<string, unknown>)[name];

/** Las fechas se comparan en segundos: la fuente no conserva los milisegundos. */
const sameValue = (actual: unknown, expected: unknown): boolean => {
  if (expected === null) return actual === null || actual === undefined;
  if (typeof expected === 'number') return Number(actual) === expected;
  if (typeof expected === 'string') {
    const a = toSeconds(actual as string | null);
    const e = toSeconds(expected);
    return a !== null && e !== null ? a === e : actual === expected;
  }
  return actual === expected;
};

const isMissing = (error: unknown): boolean => {
  const status = upstreamStatus(error);
  return (status === 404 || status === 400) && !isHtml(error);
};

const upstreamMessage = (error: unknown): string => {
  const data = (error as { response?: { data?: unknown } } | null)?.response
    ?.data;
  const message = (data as { messages?: { message?: unknown }[] } | undefined)
    ?.messages?.[0]?.message;
  return typeof message === 'string' ? message : '';
};

/** Lo que se puede rechazar sin leer la orden. */
const assertFields = (fields: MaintenancePlanFields): void => {
  if (FIELD_NAMES.every((name) => fields[name] === undefined)) {
    throw new BadRequestException('No hay nada que actualizar');
  }
  if (
    fields.notes !== undefined &&
    fields.employeeId === undefined &&
    fields.plannedStartTime === undefined
  ) {
    throw new BadRequestException(NOTES_ALONE_MESSAGE);
  }
};

/**
 * Planificación de correctivos y preventivos para integraciones, con la
 * sesión de servicio. Cada tipo de orden pone sus reglas en su flujo.
 */
@Injectable()
export class MaintenancePlanningService implements MaintenancePlanningContract {
  private readonly logger = new Logger(MaintenancePlanningService.name);
  /** Última escritura en cola de cada orden. */
  private readonly locks = new Map<string, Promise<void>>();
  private readonly flows: Partial<Record<MaintenanceKind, Flow>>;

  constructor(
    preventive: PreventiveFlow,
    private readonly openmaint: OpenmaintService,
    private readonly session: CleaningTasksSessionService,
    private readonly config: ConfigService,
    private readonly push: PushDispatchService,
  ) {
    this.flows = { preventive: preventive as unknown as Flow };
  }

  async update(
    kind: MaintenanceKind,
    id: number,
    fields: MaintenancePlanFields,
    client: string,
  ): Promise<MaintenancePlanResult> {
    assertFields(fields);
    const flow = this.flowOf(kind);
    return this.run(`update ${kind} ${id}`, async (context) =>
      this.toResult(
        flow,
        id,
        await this.exclusive(`${kind}:${id}`, () =>
          this.apply(
            flow,
            kind,
            id,
            { type: 'update', fields },
            client,
            context,
          ),
        ),
      ),
    );
  }

  async cancel(
    kind: MaintenanceKind,
    id: number,
    reason: string,
    client: string,
  ): Promise<MaintenancePlanResult> {
    const text = reason?.trim();
    if (!text) throw new BadRequestException('El motivo es obligatorio');
    const flow = this.flowOf(kind);
    return this.run(`cancel ${kind} ${id}`, async (context) =>
      this.toResult(
        flow,
        id,
        await this.exclusive(`${kind}:${id}`, () =>
          this.apply(
            flow,
            kind,
            id,
            { type: 'cancel', reason: text },
            client,
            context,
          ),
        ),
      ),
    );
  }

  /** Lee y prepara todo en paralelo; escribe después, una orden tras otra. */
  async batch(
    kind: MaintenanceKind,
    changes: MaintenancePlanChange[],
    dryRun: boolean,
    client: string,
  ): Promise<MaintenanceBatchResult[]> {
    if (new Set(changes.map(({ id }) => id)).size !== changes.length) {
      throw new BadRequestException('Hay órdenes repetidas en el lote');
    }
    const flow = this.flowOf(kind);
    const context = this.newContext();
    await this.assertSession();

    const entries = changes.map(
      ({ id, ...fields }): BatchEntry => ({ id, fields }),
    );
    const queue = [...entries];
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        try {
          assertFields(entry.fields);
          const card = await this.requireCard(flow, kind, entry.id, context);
          entry.plan = await this.plan(
            flow,
            card,
            { type: 'update', fields: entry.fields },
            context,
          );
        } catch (error) {
          entry.result = this.toFailure(entry.id, error);
        }
      }
    };
    await Promise.all(Array.from({ length: MAX_CONCURRENCY }, worker));

    for (const entry of entries) {
      const { id, plan } = entry;
      if (!plan) continue;
      if (plan.steps.length === 0) {
        entry.result = {
          id,
          result: 'unchanged',
          warnings: plan.warnings,
          error: null,
        };
      } else if (dryRun) {
        entry.result = {
          id,
          result: 'valid',
          warnings: plan.warnings,
          error: null,
        };
      }
    }

    for (const entry of entries) {
      if (entry.result) continue;
      const { id, fields } = entry;
      try {
        const applied = await this.exclusive(`${kind}:${id}`, () =>
          this.apply(
            flow,
            kind,
            id,
            { type: 'update', fields },
            client,
            context,
          ),
        );
        entry.result = {
          id,
          result: applied.applied ? 'applied' : 'unchanged',
          warnings: applied.warnings,
          error: null,
        };
      } catch (error) {
        entry.result = this.toFailure(id, error);
      }
    }

    return entries.flatMap(({ result }) => (result ? [result] : []));
  }

  // ─── Cambios ────────────────────────────────────────────────────────────────

  /** Lee, valida y escribe. Siempre dentro de `exclusive`. */
  private async apply(
    flow: Flow,
    kind: MaintenanceKind,
    id: number,
    intent: Intent,
    client: string,
    context: PlanContext,
  ): Promise<Applied> {
    const card = await this.requireCard(flow, kind, id, context);
    const plan = await this.plan(flow, card, intent, context);
    if (plan.steps.length === 0) {
      return { applied: false, warnings: plan.warnings, card };
    }

    const notes = intent.type === 'update' ? intent.fields.notes : undefined;
    const done = await this.runSteps(
      flow,
      kind,
      id,
      card,
      plan.steps,
      { client, notes },
      context,
    );
    return {
      applied: true,
      warnings: [...plan.warnings, ...done.warnings],
      card: done.card,
    };
  }

  private async plan(
    flow: Flow,
    card: Card,
    intent: Intent,
    context: PlanContext,
  ): Promise<FlowPlan> {
    let outcome: FlowOutcome;
    if (intent.type === 'cancel') {
      outcome = flow.cancelSteps(card, intent.reason);
    } else {
      const { fields } = intent;
      // La lista se lee solo si el cambio nombra a un técnico.
      const employees =
        fields.employeeId === undefined ? [] : await context.employees();
      const current = attr(card, 'Assignee');
      const needsCard =
        fields.employeeId !== undefined &&
        typeof current === 'number' &&
        current !== fields.employeeId &&
        !employees.some((employee) => employee.id === current);
      outcome = flow.prepare(card, fields, {
        employees,
        teamIds:
          fields.employeeId === undefined ? [] : parseTeamIds(this.config),
        currentIsSupplier: needsCard
          ? await context.isSupplier(current)
          : undefined,
      });
      // Sin un avance del flujo las notas no quedan en ningún sitio.
      if (
        !('error' in outcome) &&
        fields.notes !== undefined &&
        !outcome.steps.some((step) => step.type === 'advance')
      ) {
        outcome = {
          ...outcome,
          warnings: [...outcome.warnings, 'notes_not_saved' as const],
        };
      }
    }
    if ('error' in outcome) throw outcome.error;
    return outcome;
  }

  /** Una cadena no empieza sin presupuesto y, una vez empezada, no se corta. */
  private async runSteps(
    flow: Flow,
    kind: MaintenanceKind,
    id: number,
    first: Card,
    steps: FlowStep[],
    audit: { client: string; notes?: string },
    context: PlanContext,
  ): Promise<{ card: Card; warnings: MaintenancePlanWarning[] }> {
    const left = context.deadline - Date.now();
    if (left <= 0 || (steps.length > 1 && left < MIN_CHAIN_MS)) {
      throw new PlanDeadlineException();
    }

    let current = first;
    const warnings: MaintenancePlanWarning[] = [];
    for (const [index, step] of steps.entries()) {
      try {
        current = await this.applyStep(flow, kind, id, current, step, audit);
      } catch (error) {
        if (index === 0 || !step.warnIfFails) throw error;
        warnings.push(
          error instanceof UnconfirmedException && step.warnIfUnconfirmed
            ? step.warnIfUnconfirmed
            : step.warnIfFails,
        );
        break;
      }
    }
    return { card: current, warnings };
  }

  /**
   * Escribe y relee. Tras un fallo también se relee: una respuesta perdida no
   * es un cambio perdido, y repetirlo daría `unchanged` sin aviso.
   */
  private async applyStep(
    flow: Flow,
    kind: MaintenanceKind,
    id: number,
    before: Card,
    step: FlowStep,
    audit: { client: string; notes?: string },
  ): Promise<Card> {
    const noun = NOUN[kind];
    const note = `[API · ${safeActor(audit.client)}] ${audit.notes ?? step.description}`;

    let failure: unknown;
    try {
      await this.withSession((sessionId) =>
        flow.execute(sessionId, before, step, note),
      );
    } catch (error) {
      failure = error;
      this.logger.error(
        `No se pudo guardar el ${noun.toLowerCase()} ${id} — ${describeError(error)}`,
      );
      if (this.session.isCoolingDown()) throw this.unavailable();
    }

    const saved = await this.reread(flow, id);
    if (saved && this.reached(flow, saved, step)) {
      if (step.type === 'save')
        this.logSave(noun, id, audit.client, before, saved, step);
      if (step.assigns) this.notifyAssigned(kind, saved);
      return saved;
    }

    const mapped = failure === undefined ? null : this.toWriteError(failure);
    if (
      saved === null &&
      (mapped === null || mapped instanceof BadGatewayException)
    ) {
      if (step.assigns) {
        this.logger.warn(
          `${noun} ${id}: no se pudo confirmar la asignación al técnico ${String(step.expectFields.Assignee)}; el aviso al técnico no se envió`,
        );
      }
      throw new UnconfirmedException();
    }
    throw (
      mapped ??
      new BadGatewayException(
        'La fuente de datos aceptó la petición pero no aplicó el cambio',
      )
    );
  }

  /** El estado y los campos que el paso debía dejar. */
  private reached(flow: Flow, card: Card, step: FlowStep): boolean {
    return (
      flow.statusOf(card) === step.expectStatus &&
      Object.entries(step.expectFields).every(([name, expected]) =>
        sameValue(attr(card, name), expected),
      )
    );
  }

  private logSave(
    noun: string,
    id: number,
    client: string,
    before: Card,
    after: Card,
    step: FlowStep,
  ): void {
    const show = (card: Card, name: string) => {
      const value = attr(card, name);
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : 'ninguno';
    };
    this.logger.log(
      `${noun} ${id}: planificación cambiada por ${safeActor(client)}, ` +
        `técnico ${show(before, 'Assignee')} → ${show(after, 'Assignee')}, ` +
        `inicio ${show(before, 'ExpExecStartDate')} → ${show(after, 'ExpExecStartDate')}, ` +
        `paso=${step.description}`,
    );
  }

  /** Fire-and-forget: el aviso nunca cambia el resultado. */
  private notifyAssigned(kind: MaintenanceKind, card: Card): void {
    if (kind !== 'preventive') return;
    const {
      _id,
      Assignee,
      _CISubset_description,
      _CI_description,
      _Site_description,
    } = card as PreventiveMaintCard;
    if (!Assignee) return;
    try {
      void Promise.resolve(
        this.push.notifyPreventiveAssigned({
          id: _id,
          assigneeId: Assignee,
          assetName: _CISubset_description ?? _CI_description,
          buildingName: _Site_description,
        }),
      ).catch((error: unknown) => this.warnNotice(_id, error));
    } catch (error) {
      this.warnNotice(_id, error);
    }
  }

  private warnNotice(id: number, error: unknown): void {
    this.logger.warn(
      `No se pudo avisar al técnico del preventivo ${id} — ${describeError(error)}`,
    );
  }

  /** Las escrituras de una misma orden van una tras otra; gana la última. */
  private async exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = (this.locks.get(key) ?? Promise.resolve()).then(work);
    const tail = running.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(key, tail);
    try {
      return await running;
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  // ─── Lecturas ───────────────────────────────────────────────────────────────

  private newContext(): PlanContext {
    const deadline = Date.now() + OPERATION_TIMEOUT_MS;
    const suppliers = new Map<number, () => Promise<boolean>>();
    return {
      deadline,
      isSupplier: (employeeId) => {
        const load =
          suppliers.get(employeeId) ??
          once(() => this.readIsSupplier(employeeId, deadline));
        suppliers.set(employeeId, load);
        return load();
      },
      employees: once(() =>
        this.source('los técnicos', deadline, () =>
          this.withSession((sessionId) =>
            loadMaintenanceEmployees(
              this.openmaint,
              sessionId,
              parseTeamIds(this.config),
            ),
          ),
        ),
      ),
    };
  }

  /** Lectura que falla en voz alta: sin ficha legible, la orden no se reasigna. */
  private async readIsSupplier(
    employeeId: number,
    deadline: number,
  ): Promise<boolean> {
    try {
      const response = await this.source(
        `el empleado ${employeeId}`,
        deadline,
        () =>
          this.withSession((sessionId) =>
            this.openmaint.readEmployeeCard(employeeId, sessionId),
          ),
      );
      const type = response?.data?._type;
      if (typeof type !== 'string' || !type) throw new Error('sin tipo');
      return type === SUPPLIER_EMPLOYEE_TYPE;
    } catch (error) {
      if (
        error instanceof PlanDeadlineException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new BadGatewayException(
        'No se pudo comprobar quién atiende la orden: comprobar antes de repetir',
      );
    }
  }

  private async requireCard(
    flow: Flow,
    kind: MaintenanceKind,
    id: number,
    context: PlanContext,
  ): Promise<Card> {
    const card = await this.source(`el ${kind} ${id}`, context.deadline, () =>
      this.withSession((sessionId) => flow.fetchForWrite(sessionId, id)).catch(
        (error: unknown) => {
          if (isMissing(error)) return undefined;
          throw error;
        },
      ),
    );
    if (!card) throw new NotFoundException(`${NOUN[kind]} ${id} no encontrado`);
    return card;
  }

  /** Tras escribir: sin plazo de la operación, y un fallo es «no confirmado». */
  private async reread(flow: Flow, id: number): Promise<Card | null> {
    try {
      const card = await this.source('la orden tras escribir', null, () =>
        this.withSession((sessionId) => flow.fetchForWrite(sessionId, id)),
      );
      return card ?? null;
    } catch (error) {
      this.logger.warn(
        `No se pudo comprobar la orden ${id} — ${describeError(error)}`,
      );
      return null;
    }
  }

  private toResult(
    flow: Flow,
    id: number,
    applied: Applied,
  ): MaintenancePlanResult {
    let data: MaintenanceReadItem | null = null;
    try {
      data = flow.toItem(applied.card);
    } catch (error) {
      this.logger.warn(
        `No se pudo proyectar la orden ${id} — ${describeError(error)}`,
      );
    }
    return {
      id,
      result: applied.applied ? 'applied' : 'unchanged',
      warnings: applied.warnings,
      data,
    };
  }

  private flowOf(kind: MaintenanceKind): Flow {
    const flow = this.flows[kind];
    if (!flow) throw new NotImplementedException(`Sin escritura para ${kind}`);
    return flow;
  }

  // ─── Plazo, sesión y errores ────────────────────────────────────────────────

  private async run<T>(
    operation: string,
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
        throw new GatewayTimeoutException(WRITE_TIMEOUT_MESSAGE);
      }
      throw this.toHttp(operation, error);
    }
  }

  /** Con un 401 se renueva la sesión compartida y se reintenta una vez. */
  private async withSession<T>(
    work: (sessionId: string) => Promise<T>,
  ): Promise<T> {
    const sessionId = await this.assertSession();
    try {
      return await work(sessionId);
    } catch (error) {
      if (upstreamStatus(error) !== 401) throw error;
      this.session.invalidateSession(sessionId);
      return work(await this.assertSession());
    }
  }

  /** Lectura de la fuente: cualquier fallo sale como 502 (o 503 en enfriamiento). */
  private async source<T>(
    what: string,
    deadline: number | null,
    read: () => Promise<T>,
  ): Promise<T> {
    const left = deadline === null ? Infinity : deadline - Date.now();
    if (left <= 0) throw new PlanDeadlineException();
    try {
      return await withTimeout(read(), Math.min(left, READ_TIMEOUT_MS), () =>
        left <= READ_TIMEOUT_MS
          ? new PlanDeadlineException()
          : new Error('sin respuesta a tiempo'),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`No se pudo leer ${what} — ${describeError(error)}`);
      if (this.session.isCoolingDown()) throw this.unavailable();
      throw new BadGatewayException(
        'No se pudo leer la información de mantenimiento en la fuente de datos',
      );
    }
  }

  private async assertSession(): Promise<string> {
    if (this.session.isCoolingDown()) throw this.unavailable();
    const sessionId = await this.session.getSessionId();
    if (!sessionId) throw this.unavailable();
    return sessionId;
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'La planificación de mantenimiento no está disponible por el momento',
    );
  }

  /** Fallos de una escritura: la fuente da 400 a una orden ajena y 500 a una actividad gastada. */
  private toWriteError(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    const message = upstreamMessage(error);
    if (
      upstreamStatus(error) === 400 &&
      message.includes('card not existing')
    ) {
      return new NotFoundException('La orden no existe o no es accesible');
    }
    if (message.includes('task not found for instanceId')) {
      return new ConflictException(
        'La orden cambió de estado mientras se enviaba la acción: releerla y repetir',
      );
    }
    return new BadGatewayException(
      'No se pudo confirmar el cambio en la fuente de datos: comprobar antes de repetir',
    );
  }

  /** Aquí solo llegan errores propios; otro sería un fallo nuestro y no se expone. */
  private toHttp(operation: string, error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    this.logger.error(`${operation} — ${describeError(error)}`);
    return new BadGatewayException('No se pudo completar la operación');
  }

  private toFailure(id: number, error: unknown): MaintenanceBatchResult {
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
