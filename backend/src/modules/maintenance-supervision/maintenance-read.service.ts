import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReadLimiter } from '../../common/integrations/read-limiter';
import {
  isHtml,
  upstreamStatus,
} from '../../common/integrations/upstream.util';
import { describeError } from '../../common/logging/describe-error.util';
import { MaintCategoryCatalogService } from '../../integrations/openmaint/maint-category-catalog.service';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { CleaningTasksSessionService } from '../cleaning-tasks/cleaning-tasks.session.service';
import {
  PreventiveChecklistItem,
  PreventiveChecklistService,
} from '../preventive-maintenance/preventive-checklist.service';
import { CorrectiveFlow } from './flows/corrective-flow';
import type { MaintenanceFlow } from './flows/maintenance-flow.types';
import { PreventiveFlow } from './flows/preventive-flow';
import { toReadAttachment } from './flows/projection.util';
import {
  loadMaintenanceEmployees,
  parseTeamIds,
} from './maintenance-employees.util';
import type {
  MaintenanceCategory,
  MaintenanceChecklist,
  MaintenanceEmployee,
  MaintenanceKind,
  MaintenanceReadContract,
  MaintenanceReadDetail,
  MaintenanceReadFile,
  MaintenanceReadFilters,
  MaintenanceReadItem,
  MaintenanceTechnician,
  TechnicianOrder,
} from './maintenance-integration.types';

const READ_TIMEOUT_MS = 20_000;
/** La agenda y el catálogo hacen varias lecturas en cadena. */
const LONG_READ_TIMEOUT_MS = 45_000;
const MAX_CONCURRENCY = 5;
const AGENDA_PAGE = 200;
const AGENDA_MAX = 2000;
/** Consultas a la vez en todo el proceso; las descargas pesan más. */
const MAX_ACTIVE = { read: 8, download: 3 };
/** Una lectura colgada no retiene su cupo más que esto. */
const SLOT_TIMEOUT_MS = 60_000;

type SlotKind = keyof typeof MAX_ACTIVE;

const OWN_ERRORS = [
  NotFoundException,
  BadGatewayException,
  ServiceUnavailableException,
  GatewayTimeoutException,
];

/** Órdenes abiertas de un técnico; las que llevan cesionario desde que se asignan. */
const OPEN_STATUSES: Record<MaintenanceKind, string[]> = {
  corrective: ['Assignment', 'Assigned', 'Execution', 'Management'],
  preventive: ['Planning', 'Acceptance', 'Execution', 'Suspension'],
};

const toTime = (value: string | null): number =>
  value ? Date.parse(value) : NaN;

const byPlannedStart = (a: TechnicianOrder, b: TechnicianOrder): number =>
  (toTime(a.plannedStartTime) || 0) - (toTime(b.plannedStartTime) || 0) ||
  a.id - b.id;

/**
 * Lectura de correctivos y preventivos para integraciones, siempre con la
 * sesión de servicio. Un fallo nunca pasa por «lista vacía».
 */
@Injectable()
export class MaintenanceReadService implements MaintenanceReadContract {
  private readonly logger = new Logger(MaintenanceReadService.name);
  private readonly active: Record<SlotKind, number> = { read: 0, download: 0 };
  private readonly flows: Record<MaintenanceKind, MaintenanceFlow>;

  constructor(
    corrective: CorrectiveFlow,
    preventive: PreventiveFlow,
    private readonly openmaint: OpenmaintService,
    private readonly catalog: MaintCategoryCatalogService,
    private readonly checklist: PreventiveChecklistService,
    private readonly session: CleaningTasksSessionService,
    private readonly config: ConfigService,
  ) {
    this.flows = { corrective, preventive } as Record<
      MaintenanceKind,
      MaintenanceFlow
    >;
  }

  list(
    kind: MaintenanceKind,
    filters: MaintenanceReadFilters,
  ): Promise<{ items: MaintenanceReadItem[]; total: number | null }> {
    return this.execute(
      `list ${kind}`,
      'read',
      READ_TIMEOUT_MS,
      async (ctx) => {
        const flow = this.flows[kind];
        const { cards, total } = await ctx.limiter.run(() =>
          flow.search(ctx.sessionId, filters),
        );
        return { items: cards.map((card) => flow.toItem(card)), total };
      },
    );
  }

  detail(kind: MaintenanceKind, id: number): Promise<MaintenanceReadDetail> {
    return this.execute(
      `detail ${kind} ${id}`,
      'read',
      READ_TIMEOUT_MS,
      async ({ limiter, sessionId }) => {
        const flow = this.flows[kind];
        const card = await this.requireCard(kind, id, sessionId, limiter);
        const [attachments, checklist] = await Promise.all([
          limiter
            .run(() => flow.attachments(sessionId, id))
            .then((raw) => raw.map((a) => toReadAttachment(flow.path, id, a))),
          kind === 'preventive'
            ? this.readChecklist(id, sessionId, limiter)
            : { value: null, failed: false },
        ]);

        const detail = flow.toDetail(card, {
          attachments,
          checklist: checklist.value,
        });
        if (checklist.failed) detail.warnings.push('checklist_unavailable');
        return detail;
      },
    );
  }

  attachment(
    kind: MaintenanceKind,
    id: number,
    attachmentId: string,
  ): Promise<MaintenanceReadFile> {
    return this.execute(
      `attachment ${kind} ${id}`,
      'download',
      READ_TIMEOUT_MS,
      async ({ limiter, sessionId }) => {
        const flow = this.flows[kind];
        await this.requireCard(kind, id, sessionId, limiter);
        const found = (
          await limiter.run(() => flow.attachments(sessionId, id))
        ).find((a) => a._id === attachmentId);
        if (!found) throw new NotFoundException('Archivo no encontrado');

        const file = await limiter.run(() =>
          flow.download(sessionId, id, found._id),
        );
        return {
          data: file.data,
          contentType: file.contentType,
          fileName: found.fileName || found.name || null,
        };
      },
    );
  }

  async technicians(range: {
    from: string;
    to: string;
  }): Promise<MaintenanceTechnician[]> {
    const teamIds = parseTeamIds(this.config);

    return this.execute(
      'technicians',
      'read',
      LONG_READ_TIMEOUT_MS,
      async ({ limiter, sessionId }) => {
        const [employees, agenda] = await Promise.all([
          this.readEmployees(teamIds, sessionId, limiter),
          this.readAgenda(sessionId, limiter),
        ]);

        const from = Date.parse(range.from);
        const to = Date.parse(range.to);
        const byId = new Map(
          employees.map((employee) => [
            employee.id,
            {
              ...employee,
              inExecution: [],
              correctives: [],
              preventives: [],
              unscheduled: [],
            } as MaintenanceTechnician,
          ]),
        );

        for (const { kind, item } of agenda) {
          const technician = item.assignee && byId.get(item.assignee.id);
          if (!technician) continue;

          const order: TechnicianOrder = {
            id: item.id,
            number: item.number,
            title: item.title,
            status: item.status,
            building: item.building,
            plannedStartTime: item.plannedStartTime,
            actualStartTime: item.actualStartTime,
          };
          if (item.status === 'Execution') {
            technician.inExecution.push({ kind, id: item.id });
          }

          const planned = toTime(item.plannedStartTime);
          if (Number.isNaN(planned)) {
            technician.unscheduled.push({ ...order, kind });
          } else if (planned >= from && planned < to) {
            technician[
              kind === 'corrective' ? 'correctives' : 'preventives'
            ].push(order);
          }
        }

        return [...byId.values()]
          .map((technician) => ({
            ...technician,
            correctives: technician.correctives.sort(byPlannedStart),
            preventives: technician.preventives.sort(byPlannedStart),
            unscheduled: technician.unscheduled.sort(byPlannedStart),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id - b.id);
      },
    );
  }

  categories(): Promise<MaintenanceCategory[]> {
    return this.execute(
      'categories',
      'read',
      LONG_READ_TIMEOUT_MS,
      ({ sessionId }) => this.catalog.list(sessionId),
    );
  }

  // ─── Plazo, sesión y errores ────────────────────────────────────────────────

  private async execute<T>(
    operation: string,
    kind: SlotKind,
    timeoutMs: number,
    read: (ctx: { limiter: ReadLimiter; sessionId: string }) => Promise<T>,
  ): Promise<T> {
    const release = this.takeSlot(kind);
    const limiter = new ReadLimiter(MAX_CONCURRENCY);
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new GatewayTimeoutException(
              'La consulta de mantenimiento tardó demasiado',
            ),
          ),
        timeoutMs,
      );
    });

    try {
      // El cupo se libera al terminar la lectura, aunque el plazo ya haya vencido.
      const reading = this.assertSession()
        .then((sessionId) => read({ limiter, sessionId }))
        .finally(release);
      return await Promise.race([reading, deadline]);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`${operation} — ${describeError(error)}`);
      if (OWN_ERRORS.some((own) => error instanceof own)) throw error;
      if (this.session.isCoolingDown()) throw this.unavailable();
      throw new BadGatewayException(
        'No se pudo leer la información de mantenimiento en la fuente de datos',
      );
    } finally {
      clearTimeout(timer);
      limiter.close();
    }
  }

  private takeSlot(kind: SlotKind): () => void {
    if (this.active[kind] >= MAX_ACTIVE[kind]) {
      throw new ServiceUnavailableException(
        'Hay demasiadas consultas en curso: repetir en unos segundos',
      );
    }
    this.active[kind]++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      this.active[kind]--;
    };
    const timer = setTimeout(release, SLOT_TIMEOUT_MS);
    timer.unref();
    return release;
  }

  /** Sin sesión no se llama a la fuente: cada 401 provocaría otro login. */
  private async assertSession(): Promise<string> {
    if (this.session.isCoolingDown()) throw this.unavailable();
    const sessionId = await this.session.getSessionId();
    if (!sessionId) throw this.unavailable();
    return sessionId;
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'La consulta de mantenimiento no está disponible por el momento',
    );
  }

  // ─── Lecturas ───────────────────────────────────────────────────────────────

  private async requireCard(
    kind: MaintenanceKind,
    id: number,
    sessionId: string,
    limiter: ReadLimiter,
  ) {
    const notFound = () =>
      new NotFoundException(
        `${kind === 'corrective' ? 'Correctivo' : 'Preventivo'} ${id} no encontrado`,
      );
    const card = await limiter
      .run(() => this.flows[kind].fetch(sessionId, id))
      .catch((error: unknown) => {
        // La fuente responde 404 (o 400) a un id inexistente.
        const status = upstreamStatus(error);
        const missing = (status === 404 || status === 400) && !isHtml(error);
        throw missing ? notFound() : error;
      });
    if (!card) throw notFound();
    return card;
  }

  /** Solo lectura: nunca abre ni modifica el checklist. */
  private async readChecklist(
    id: number,
    sessionId: string,
    limiter: ReadLimiter,
  ): Promise<{ value: MaintenanceChecklist | null; failed: boolean }> {
    try {
      const items = await limiter.run(() =>
        this.checklist.getChecklist(sessionId, id),
      );
      if (items.length === 0) return { value: null, failed: false };

      let failed = false;
      const projected = items.map((item) => {
        const { value, unresolved } = this.checklistValue(item);
        failed ||= unresolved;
        return {
          order: item.order,
          label: item.label,
          kind: item.kind,
          value,
          isResolved: item.isResolved,
          equipment: item.equipment,
        };
      });

      return {
        value: {
          total: items.length,
          resolved: items.filter((item) => item.isResolved).length,
          items: projected,
        },
        failed,
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el checklist del preventivo ${id} — ${describeError(error)}`,
      );
      return { value: null, failed: true };
    }
  }

  /**
   * En los desplegables el resultado es un id: se entrega su etiqueta. Sin la
   * opción (el lookup falló) no se expone el id crudo: `null` y se avisa.
   */
  private checklistValue(item: PreventiveChecklistItem): {
    value: string | number | null;
    unresolved: boolean;
  } {
    if (!item.options) return { value: item.value, unresolved: false };
    if (item.value === null || item.value === '') {
      return { value: null, unresolved: false };
    }
    const option = item.options.find(
      (candidate) => candidate.id === String(item.value),
    );
    return option
      ? { value: option.label, unresolved: false }
      : { value: null, unresolved: true };
  }

  private readEmployees(
    teamIds: number[],
    sessionId: string,
    limiter: ReadLimiter,
  ): Promise<MaintenanceEmployee[]> {
    return loadMaintenanceEmployees(
      this.openmaint,
      sessionId,
      teamIds,
      (read) => limiter.run(read),
    );
  }

  /** Todas las órdenes abiertas con cesionario; superar el tope es un error. */
  private async readAgenda(
    sessionId: string,
    limiter: ReadLimiter,
  ): Promise<{ kind: MaintenanceKind; item: MaintenanceReadItem }[]> {
    const queries = (Object.keys(OPEN_STATUSES) as MaintenanceKind[]).flatMap(
      (kind) => OPEN_STATUSES[kind].map((status) => ({ kind, status })),
    );

    const lists = await Promise.all(
      queries.map(async ({ kind, status }) => {
        const flow = this.flows[kind];
        const items: MaintenanceReadItem[] = [];

        for (let offset = 0; ; offset += AGENDA_PAGE) {
          const { cards, total } = await limiter.run(() =>
            flow.search(sessionId, {
              status,
              assigned: true,
              limit: AGENDA_PAGE,
              offset,
            }),
          );
          items.push(...cards.map((card) => flow.toItem(card)));

          if (cards.length < AGENDA_PAGE) break;
          if (total !== null && offset + AGENDA_PAGE >= total) break;
          if (offset + AGENDA_PAGE >= AGENDA_MAX) {
            throw new Error('la agenda superó el tope');
          }
        }

        return items.map((item) => ({ kind, item }));
      }),
    );

    return lists.flat();
  }
}
