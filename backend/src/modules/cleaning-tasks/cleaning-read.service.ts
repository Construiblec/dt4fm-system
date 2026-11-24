import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describeError } from '../../common/logging/describe-error.util';
import {
  CLEANINGS_API_BASE_PATH,
  CleaningReadAttachment,
  CleaningReadContract,
  CleaningReadDetail,
  CleaningReadFile,
  CleaningReadFilters,
  CleaningReadFinding,
  CleaningReadItem,
  CleaningReadPhoto,
  CleaningReadSupervision,
  CleaningReadSupervisionSummary,
  CleaningReadWarning,
} from './cleaning-read.types';
import {
  CleaningSupervisionsOpenmaintService,
  FindingCard,
  SupervisionCard,
} from './cleaning-supervisions.openmaint.service';
import { CleaningSupervisionsService } from './cleaning-supervisions.service';
import {
  AttachmentCard,
  CleaningTaskCard,
  CleaningTasksOpenmaintService,
} from './cleaning-tasks.openmaint.service';
import { CleaningTasksService } from './cleaning-tasks.service';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';
import { PHASE_NAMES } from './constants/phase.constants';
import { resolveAttachmentOrigin } from './constants/supervision-evidence.constants';
import { isFixPhoto } from './constants/supervision.constants';
import type { SupervisionPoint } from './utils/supervision-checklist.util';

const READ_TIMEOUT_MS = 20_000;
const MAX_CONCURRENCY = 5;
const RECENT_SUPERVISIONS = 500;
const DOWNLOAD_LIMITS = { timeout: 20_000, maxContentLength: 25 * 1024 * 1024 };
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

type ListItem = Awaited<
  ReturnType<CleaningTasksService['toListItems']>
>[number];

/** Tope de lecturas a la vez; al cerrarse no empieza ninguna más. */
class ReadLimiter {
  private active = 0;
  private closed = false;
  private readonly waiting: Array<() => void> = [];

  async run<T>(read: () => Promise<T>): Promise<T> {
    while (!this.closed && this.active >= MAX_CONCURRENCY) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    if (this.closed) throw new Error('la lectura ya terminó');
    this.active++;
    try {
      return await read();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  close(): void {
    this.closed = true;
    this.waiting.splice(0).forEach((resume) => resume());
  }
}

/** Un listado sin `data` es un fallo de la fuente, no un listado vacío. */
const requireList = <T>(response: { data?: T[] } | null | undefined): T[] => {
  if (!Array.isArray(response?.data)) {
    throw new Error('la fuente respondió sin listado');
  }
  return response.data;
};

/** Los lookups sin descripción llegan como id interno: no se exponen. */
const labelOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value && !/^\d+$/.test(value) ? value : null;

const fileNameOf = (a: AttachmentCard): string | null =>
  a.name || a.fileName || null;

const upstreamStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

/** Una página HTML es de un proxy caído, no la respuesta de la fuente. */
const isHtml = (error: unknown): boolean => {
  const body = (error as { response?: { data?: unknown } } | null)?.response
    ?.data;
  return typeof body === 'string' && body.trimStart().startsWith('<');
};

/** Sin descripción la fase llega como id interno: se traduce o queda en `Unknown`. */
const phaseName = (phase: unknown): string => {
  const value = String(phase);
  if (!/^\d+$/.test(value)) return value;
  return (PHASE_NAMES as Record<string, string>)[value] ?? 'Unknown';
};

/**
 * Lectura de limpiezas para integraciones, siempre con la sesión de servicio.
 * A diferencia de los listados de la app, aquí un fallo nunca pasa por vacío.
 */
@Injectable()
export class CleaningReadService implements CleaningReadContract {
  private readonly logger = new Logger(CleaningReadService.name);
  private readonly active: Record<SlotKind, number> = { read: 0, download: 0 };

  constructor(
    private readonly tasks: CleaningTasksService,
    private readonly tasksGateway: CleaningTasksOpenmaintService,
    private readonly supervisions: CleaningSupervisionsService,
    private readonly supervisionsGateway: CleaningSupervisionsOpenmaintService,
    private readonly session: CleaningTasksSessionService,
  ) {}

  list(
    filters: CleaningReadFilters,
  ): Promise<{ items: CleaningReadItem[]; total: number | null }> {
    return this.execute('list', 'read', async (limiter) => {
      const [response, recent] = await Promise.all([
        limiter.run(() =>
          this.tasksGateway.getAllTasks({ ...filters, sort: 'newest' }),
        ),
        limiter.run(() =>
          this.supervisionsGateway.findRecent(RECENT_SUPERVISIONS, true),
        ),
      ]);
      const cards = requireList(response);

      // Llegan de la más nueva a la más vieja: la primera de cada limpieza gana.
      const latest = new Map<number, SupervisionCard>();
      for (const supervision of recent) {
        const taskId = supervision.CleaningTask;
        if (taskId && !latest.has(taskId)) latest.set(taskId, supervision);
      }
      if (recent.length >= RECENT_SUPERVISIONS) {
        await Promise.all(
          cards
            .filter((card) => !latest.has(card._id))
            .map(async ({ _id }) => {
              const [last] = await limiter.run(() =>
                this.supervisionsGateway.findByTask(_id, true),
              );
              if (last) latest.set(_id, last);
            }),
        );
      }

      return {
        items: await this.toItems(cards, latest, limiter),
        total: response.meta?.total ?? null,
      };
    });
  }

  detail(id: number): Promise<CleaningReadDetail> {
    return this.execute(`detail ${id}`, 'read', async (limiter) => {
      const task = await this.requireTask(id, limiter);
      const [attachments, { supervisions, pointsFailed }, checklist, [item]] =
        await Promise.all([
          limiter
            .run(() => this.tasksGateway.getAttachmentsWithSession(id))
            .then((response) => requireList(response)),
          this.readSupervisions(id, limiter),
          this.readChecklist(task.CleaningChecklist, limiter),
          this.toItems([task], new Map(), limiter),
        ]);

      const last = supervisions.at(0);
      const warnings = [...item.warnings];
      if (checklist.failed || pointsFailed) {
        warnings.push('checklist_unavailable');
      }
      return {
        ...item,
        supervision: last
          ? {
              id: last.id,
              phase: last.phase,
              phaseLabel: last.phaseLabel,
              corrector: last.corrector,
            }
          : null,
        // `Notes` también guarda comentarios de revisión de limpiezas antiguas.
        cancelReason: item.phase === 'Cancelled' ? (task.Notes ?? null) : null,
        notes: task.Notes ?? null,
        checklist: checklist.value,
        attachments: attachments.map((a) => this.toAttachment(id, a)),
        supervisions,
        warnings,
      };
    });
  }

  attachment(id: number, attachmentId: string): Promise<CleaningReadFile> {
    return this.execute(`attachment ${id}`, 'download', async (limiter) => {
      await this.requireTask(id, limiter);
      const found = requireList(
        await limiter.run(() =>
          this.tasksGateway.getAttachmentsWithSession(id),
        ),
      ).find((a) => a._id === attachmentId);
      if (!found) throw new NotFoundException('Archivo no encontrado');

      const file = await limiter.run(() =>
        this.tasksGateway.downloadAttachmentWithSession(
          id,
          found._id,
          DOWNLOAD_LIMITS,
        ),
      );
      return this.toFile(file, found);
    });
  }

  findingPhoto(
    id: number,
    supervisionId: number,
    findingId: number,
    photoId: string,
  ): Promise<CleaningReadFile> {
    return this.execute(`findingPhoto ${id}`, 'download', async (limiter) => {
      const notFound = () => new NotFoundException('Foto no encontrada');
      await this.requireTask(id, limiter);

      const supervision = (
        await limiter.run(() => this.supervisionsGateway.findByTask(id, true))
      ).find((s) => s._id === supervisionId);
      if (!supervision) throw notFound();

      const finding = (
        await limiter.run(() =>
          this.supervisionsGateway.listFindings(supervision._id, true),
        )
      ).find((f) => f._id === findingId);
      if (!finding) throw notFound();

      const photo = (
        await limiter.run(() =>
          this.supervisionsGateway.listFindingAttachments(finding._id, true),
        )
      ).find((a) => a._id === photoId);
      if (!photo) throw notFound();

      const file = await limiter.run(() =>
        this.supervisionsGateway.downloadFindingAttachment(
          finding._id,
          photo._id,
          DOWNLOAD_LIMITS,
        ),
      );
      return this.toFile(file, photo);
    });
  }

  // ─── Plazo, sesión y errores ────────────────────────────────────────────────

  private async execute<T>(
    operation: string,
    kind: SlotKind,
    read: (limiter: ReadLimiter) => Promise<T>,
  ): Promise<T> {
    const release = this.takeSlot(kind);
    const limiter = new ReadLimiter();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new GatewayTimeoutException(
              'La consulta de limpiezas tardó demasiado',
            ),
          ),
        READ_TIMEOUT_MS,
      );
    });

    try {
      // El cupo se libera al terminar la lectura, aunque el plazo ya haya vencido.
      const reading = this.assertSession()
        .then(() => read(limiter))
        .finally(release);
      return await Promise.race([reading, deadline]);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`${operation} — ${describeError(error)}`);
      if (OWN_ERRORS.some((own) => error instanceof own)) throw error;
      if (this.session.isCoolingDown()) throw this.unavailable();
      throw new BadGatewayException(
        'No se pudo leer la información de limpiezas en la fuente de datos',
      );
    } finally {
      clearTimeout(timer);
      limiter.close();
    }
  }

  private takeSlot(kind: SlotKind): () => void {
    if (this.active[kind] >= MAX_ACTIVE[kind]) {
      throw new ServiceUnavailableException(
        'Hay demasiadas consultas en curso; repite en unos segundos',
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
  private async assertSession(): Promise<void> {
    if (this.session.isCoolingDown()) throw this.unavailable();
    if (!(await this.session.getSessionId())) throw this.unavailable();
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'La consulta de limpiezas no está disponible por el momento',
    );
  }

  // ─── Lecturas ───────────────────────────────────────────────────────────────

  private async requireTask(
    id: number,
    limiter: ReadLimiter,
  ): Promise<CleaningTaskCard> {
    const notFound = () =>
      new NotFoundException(`Limpieza ${id} no encontrada`);
    const response = await limiter
      .run(() => this.tasksGateway.getTaskByIdWithSession(id))
      .catch((error: unknown) => {
        // La fuente responde 404 (o 400) a un id inexistente.
        const status = upstreamStatus(error);
        const missing = (status === 404 || status === 400) && !isHtml(error);
        throw missing ? notFound() : error;
      });
    if (!response?.data) throw notFound();
    return response.data;
  }

  /** Por grupos de unidad: `toListItems` lee las unidades sin tope propio. */
  private async toItems(
    cards: CleaningTaskCard[],
    latest: Map<number, SupervisionCard>,
    limiter: ReadLimiter,
  ): Promise<CleaningReadItem[]> {
    const groups = new Map<number | null, CleaningTaskCard[]>();
    for (const card of cards) {
      const unitId = card.Unit ?? null;
      groups.set(unitId, [...(groups.get(unitId) ?? []), card]);
    }
    const listed = await Promise.all(
      [...groups.values()].map((group) =>
        limiter.run(() => this.tasks.toListItems(group, '')),
      ),
    );
    const byId = new Map(listed.flat().map((item) => [item.id, item]));
    return cards.map((card) =>
      this.toItem(
        byId.get(card._id) as ListItem,
        card.Unit ?? null,
        latest.get(card._id),
      ),
    );
  }

  private async readChecklist(
    checklistId: number | null | undefined,
    limiter: ReadLimiter,
  ): Promise<{ value: CleaningReadDetail['checklist']; failed: boolean }> {
    if (!checklistId) return { value: null, failed: false };
    try {
      const { data } = await limiter.run(() =>
        this.tasks.getChecklist(checklistId),
      );
      // Con el archivo ilegible llegan las filas de respaldo: se avisa, y si no hay, null.
      const failed = data.plantilla?.readable === false;
      if (failed && data.activities.length === 0) {
        return { value: null, failed };
      }
      return {
        value: {
          id: data.id,
          code: data.code,
          description: data.description,
          activities: data.activities,
        },
        failed,
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el checklist ${checklistId} — ${describeError(error)}`,
      );
      return { value: null, failed: true };
    }
  }

  private async readSupervisions(
    taskId: number,
    limiter: ReadLimiter,
  ): Promise<{
    supervisions: CleaningReadSupervision[];
    pointsFailed: boolean;
  }> {
    const cards = await limiter.run(() =>
      this.supervisionsGateway.findByTask(taskId, true),
    );

    // Varias supervisiones suelen compartir checklist: se lee una vez.
    const pending = new Map<number, Promise<SupervisionPoint[]>>();
    let pointsFailed = false;
    const pointsOf = (checklistId: number) => {
      let points = pending.get(checklistId);
      if (!points) {
        points = limiter
          .run(() => this.supervisions.templatePoints(checklistId))
          .catch((error: unknown) => {
            pointsFailed = true;
            this.logger.warn(
              `No se pudo leer el checklist de supervisión ${checklistId} — ${describeError(error)}`,
            );
            return [];
          });
        pending.set(checklistId, points);
      }
      return points;
    };

    const supervisions = await Promise.all(
      cards.map(async (card): Promise<CleaningReadSupervision> => {
        const findings = [
          ...(await limiter.run(() =>
            this.supervisionsGateway.listFindings(card._id, true),
          )),
        ].sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0) || a._id - b._id);

        const [points, attachments] = await Promise.all([
          findings.length > 0 && card.Checklist
            ? pointsOf(card.Checklist)
            : Promise.resolve<SupervisionPoint[]>([]),
          Promise.all(
            findings.map((finding) =>
              limiter.run(() =>
                this.supervisionsGateway.listFindingAttachments(
                  finding._id,
                  true,
                ),
              ),
            ),
          ),
        ]);

        return {
          ...this.toSummary(card),
          supervisor: card.Supervisor
            ? {
                id: card.Supervisor,
                name: card._Supervisor_description ?? '',
              }
            : null,
          checklistId: card.Checklist ?? null,
          findings: findings.map((finding, i) =>
            this.toFinding(taskId, card._id, finding, points, attachments[i]),
          ),
        };
      }),
    );
    return { supervisions, pointsFailed };
  }

  // ─── Proyección (campo a campo: un campo nuevo no sale sin decidirlo) ───────

  private toItem(
    item: ListItem,
    unitId: number | null,
    supervision: SupervisionCard | undefined,
  ): CleaningReadItem {
    const { unit, employee, checklist } = item;
    const warnings: CleaningReadWarning[] =
      unitId !== null && !unit ? ['unit_unavailable'] : [];
    return {
      id: item.id,
      type: item.type,
      taskNumber: item.taskNumber ?? null,
      description: item.description,
      phase: phaseName(item.phase),
      isPaused: item.isPaused,
      source: labelOrNull(item.source),
      generatedDate: item.generatedDate ?? null,
      plannedStartTime: item.plannedStartTime,
      plannedEndTime: item.plannedEndTime,
      actualStartTime: item.actualStartTime,
      actualEndTime: item.actualEndTime,
      executionTime: item.executionTime,
      delayTime: item.delayTime,
      sessionStartedAt: item.sessionStartedAt,
      sessionBaseMinutes: item.sessionBaseMinutes,
      taskObservations: item.taskObservations,
      supervisionObserv: item.supervisionObserv,
      teamObservations: item.teamObservations,
      hostawayReservation: item.hostawayReservation,
      hostawayListingId: item.hostawayListingId,
      checkoutDate: item.checkoutDate,
      unitId,
      unit: unit
        ? {
            id: unit.id,
            code: unit.code,
            description: unit.description,
            name: unit.name,
            building: unit.building,
            buildingId: unit.buildingId,
          }
        : null,
      employee: employee ? { id: employee.id, name: employee.name } : null,
      checklist: checklist
        ? { id: checklist.id, description: checklist.description }
        : null,
      supervision: supervision ? this.toSummary(supervision) : null,
      warnings,
    };
  }

  private toSummary(card: SupervisionCard): CleaningReadSupervisionSummary {
    return {
      id: card._id,
      phase: card._Phase_code ?? null,
      phaseLabel: card._Phase_description ?? null,
      corrector: card.Employee
        ? { id: card.Employee, name: card._Employee_description ?? '' }
        : null,
    };
  }

  private toFinding(
    taskId: number,
    supervisionId: number,
    finding: FindingCard,
    points: SupervisionPoint[],
    attachments: AttachmentCard[],
  ): CleaningReadFinding {
    const point = points.find((p) => p.index === finding.Index);
    const toPhoto = (a: AttachmentCard): CleaningReadPhoto => ({
      id: a._id,
      fileName: fileNameOf(a),
      uploadDate: a.created ?? a.modified ?? null,
      downloadUrl: `${CLEANINGS_API_BASE_PATH}/${taskId}/supervisions/${supervisionId}/findings/${finding._id}/photos/${encodeURIComponent(a._id)}`,
    });
    return {
      id: finding._id,
      index: finding.Index ?? null,
      point: point
        ? { area: point.area, name: point.name, criterion: point.criterion }
        : null,
      subcategory: finding.Subcategory
        ? {
            id: finding.Subcategory,
            name: finding._Subcategory_description ?? null,
          }
        : null,
      observation: finding.Observation ?? null,
      resolvedBySupervisor: finding.SolvedBySuperv === true,
      photos: attachments.filter((a) => !isFixPhoto(a)).map(toPhoto),
      fixPhotos: attachments.filter(isFixPhoto).map(toPhoto),
    };
  }

  private toAttachment(
    taskId: number,
    a: AttachmentCard,
  ): CleaningReadAttachment {
    return {
      id: a._id,
      fileName: fileNameOf(a),
      category: labelOrNull(a._category_description ?? a.category),
      description: a.description ?? null,
      origin: resolveAttachmentOrigin(a),
      uploadDate: a.created ?? a.modified ?? null,
      downloadUrl: `${CLEANINGS_API_BASE_PATH}/${taskId}/attachments/${encodeURIComponent(a._id)}`,
    };
  }

  private toFile(
    file: { data: Buffer; contentType: string },
    listed: AttachmentCard,
  ): CleaningReadFile {
    return {
      data: file.data,
      contentType: file.contentType,
      fileName: fileNameOf(listed),
    };
  }
}
