import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleDestroy,
} from '@nestjs/common';
import { describeError } from '../../common/logging/describe-error.util';
import type { CleaningPlanCounts } from '../push-notifications/notification-catalog';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import type { CleaningPlanSnapshot } from './cleaning-planning.types';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';

/** Se envía tras este tiempo sin cambios nuevos… */
const QUIET_MS = 60_000;
/** …o como mucho a este plazo del primer cambio. */
const MAX_WAIT_MS = 5 * 60_000;
const MAX_PENDING = 500;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const LOCATION_TIMEOUT_MS = 5_000;

type PendingChange = {
  before: CleaningPlanSnapshot;
  after: CleaningPlanSnapshot;
};

type TaskLocation = { unitName?: string; buildingName?: string | null };

type NoticeKind = keyof CleaningPlanCounts;

type Notice = { employeeId: number; kind: NoticeKind };

type EmployeeNotices = { taskIds: number[]; counts: CleaningPlanCounts };

const sameInstant = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return !a && !b;
  const [first, second] = [Date.parse(a), Date.parse(b)];
  return Number.isNaN(first) || Number.isNaN(second)
    ? a === b
    : first === second;
};

/** A quién hay que avisar, y de qué, por el paso de `before` a `after`. */
const netNotices = ({ before, after }: PendingChange): Notice[] => {
  const from = before.cancelled ? null : before.employeeId;
  const to = after.cancelled ? null : after.employeeId;

  if (after.cancelled) {
    return from === null ? [] : [{ employeeId: from, kind: 'cancelled' }];
  }

  if (from === to) {
    const sameSchedule =
      sameInstant(before.plannedStartTime, after.plannedStartTime) &&
      sameInstant(before.plannedEndTime, after.plannedEndTime);
    return to === null || sameSchedule
      ? []
      : [{ employeeId: to, kind: 'rescheduled' }];
  }

  const notices: Notice[] = [];
  if (from !== null) notices.push({ employeeId: from, kind: 'removed' });
  if (to !== null) notices.push({ employeeId: to, kind: 'assigned' });
  return notices;
};

/**
 * Avisos agrupados a los operarios por cambios de planificación. La ventana es
 * única: un cambio de operario debe netear a los dos afectados a la vez.
 */
@Injectable()
export class CleaningNoticesService
  implements OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(CleaningNoticesService.name);
  private pending = new Map<number, PendingChange>();
  private firstAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly pushDispatch: PushDispatchService,
    private readonly openmaint: CleaningTasksOpenmaintService,
  ) {}

  /** Solo acumula; nunca lanza, porque el cambio ya está guardado. */
  record(
    taskId: number,
    before: CleaningPlanSnapshot,
    after: CleaningPlanSnapshot,
  ): void {
    try {
      const known = this.pending.get(taskId);

      // Un cambio que no interesa a nadie no abre ni alarga la ventana.
      if (!known && netNotices({ before, after }).length === 0) return;

      if (this.pending.size === 0) this.firstAt = Date.now();
      this.pending.set(taskId, {
        before: known?.before ?? { ...before },
        after: { ...after },
      });

      if (this.pending.size >= MAX_PENDING) {
        void this.flush();
      } else {
        this.schedule();
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo anotar el aviso de la limpieza ${taskId} — ${describeError(error)}`,
      );
    }
  }

  /** Envía lo pendiente y espera también a los envíos en curso. Nunca rechaza. */
  async flush(): Promise<void> {
    this.clearTimer();

    if (this.pending.size > 0) {
      // El lote se retira antes de enviar: otro flush simultáneo no lo repite.
      const batch = this.pending;
      this.pending = new Map();

      const sending = this.send(batch).finally(() =>
        this.inFlight.delete(sending),
      );
      this.inFlight.add(sending);
    }

    await Promise.all(this.inFlight);
  }

  onModuleDestroy(): Promise<void> {
    return this.flushWithDeadline();
  }

  /** Cambios de peticiones que terminaron después; la base se cierra más tarde. */
  onApplicationShutdown(): Promise<void> {
    return this.flushWithDeadline();
  }

  // ─── Interno ────────────────────────────────────────────────────────────────

  private schedule(): void {
    this.clearTimer();
    const left = this.firstAt + MAX_WAIT_MS - Date.now();
    this.timer = setTimeout(
      () => void this.flush(),
      Math.max(0, Math.min(QUIET_MS, left)),
    );
    this.timer.unref();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async flushWithDeadline(): Promise<void> {
    const done = await this.withTimeout(
      this.flush().then(() => true),
      SHUTDOWN_TIMEOUT_MS,
    );
    if (!done) {
      this.logger.warn('Cierre sin terminar de enviar los avisos de limpiezas');
    }
  }

  /** `null` si vence el plazo. */
  private async withTimeout<T>(
    work: Promise<T>,
    ms: number,
  ): Promise<T | null> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    });
    try {
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async send(batch: Map<number, PendingChange>): Promise<void> {
    try {
      await Promise.all(
        [...this.groupByEmployee(batch)].map(([employeeId, notices]) =>
          this.sendToEmployee(employeeId, notices),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `No se pudieron enviar los avisos de limpiezas — ${describeError(error)}`,
      );
    }
  }

  private groupByEmployee(
    batch: Map<number, PendingChange>,
  ): Map<number, EmployeeNotices> {
    const grouped = new Map<number, EmployeeNotices>();

    for (const [taskId, change] of batch) {
      for (const { employeeId, kind } of netNotices(change)) {
        const entry = grouped.get(employeeId) ?? {
          taskIds: [],
          counts: { assigned: 0, rescheduled: 0, removed: 0, cancelled: 0 },
        };
        entry.taskIds.push(taskId);
        entry.counts[kind] += 1;
        grouped.set(employeeId, entry);
      }
    }

    return grouped;
  }

  private async sendToEmployee(
    cleaningEmployeeId: number,
    { taskIds, counts }: EmployeeNotices,
  ): Promise<void> {
    try {
      if (taskIds.length === 1 && counts.assigned === 1) {
        const [id] = taskIds;
        const location = await this.locationOf(id, cleaningEmployeeId);

        // Reasignada desde la app entre medias: ya no es suya.
        if (location === 'not-theirs') return;
        if (location) {
          await this.pushDispatch.notifyCleaningAssigned({
            id,
            cleaningEmployeeId,
            ...location,
          });
          return;
        }
      }

      await this.pushDispatch.notifyCleaningPlanUpdated({
        cleaningEmployeeId,
        counts,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar al operario ${cleaningEmployeeId} de su plan de limpiezas — ` +
          describeError(error),
      );
    }
  }

  /** `null` si la limpieza no se puede leer a tiempo. */
  private async locationOf(
    taskId: number,
    employeeId: number,
  ): Promise<TaskLocation | 'not-theirs' | null> {
    try {
      return await this.withTimeout(
        this.readLocation(taskId, employeeId),
        LOCATION_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la ubicación de la limpieza ${taskId} — ${describeError(error)}`,
      );
      return null;
    }
  }

  private async readLocation(
    taskId: number,
    employeeId: number,
  ): Promise<TaskLocation | 'not-theirs' | null> {
    const task = (await this.openmaint.getTaskByIdWithSession(taskId))?.data;
    if (!task) return null;
    if (task.Employee !== employeeId) return 'not-theirs';

    // Sin la unidad basta con su nombre en la tarjeta.
    const unit = task.Unit
      ? (await this.openmaint.getUnitById(task.Unit, '').catch(() => null))
          ?.data
      : null;

    return {
      unitName: task._Unit_description ?? unit?.Description,
      buildingName: unit?._Building_description,
    };
  }
}
