import { Injectable, Logger } from '@nestjs/common';
import { PushSubscription } from './entities/push-subscription.entity';
import {
  CLEANING_SUPERVISOR_ROLES,
  MAINTENANCE_SUPERVISOR_ROLES,
  PushMessage,
  cleaningAssigned,
  cleaningCompleted,
  cleaningDelayed,
  correctiveAssigned,
  correctiveCompleted,
  correctiveOpened,
  joinLocation,
  preventiveAssigned,
  preventivePlanning,
  preventiveResumed,
  preventiveSuspended,
} from './notification-catalog';
import { PushSenderService } from './push-sender.service';
import { PushSubscriptionRepository } from './push-subscription.repository';

type Location = {
  unitName?: string | null;
  floorName?: string | null;
  buildingName?: string | null;
};

/**
 * Punto único desde el que los módulos de dominio notifican. Todos los métodos
 * son best-effort: se llaman fire-and-forget y nunca propagan un error, porque
 * un fallo de notificación no debe tumbar la operación que la originó.
 */
@Injectable()
export class PushDispatchService {
  private readonly logger = new Logger(PushDispatchService.name);

  constructor(
    private readonly repository: PushSubscriptionRepository,
    private readonly sender: PushSenderService,
  ) {}

  // ─── Correctivos ────────────────────────────────────────────────────────────

  async notifyCorrectiveOpened(
    input: Location & {
      id: string | number;
      requesterName?: string | null;
      /** Desplaza a la unidad cuando el correctivo se abrió sobre un activo. */
      assetName?: string | null;
    },
  ): Promise<void> {
    await this.safe(async () => {
      const message = correctiveOpened({
        id: input.id,
        requesterName: input.requesterName?.trim() || 'Un usuario',
        location: this.formatLocation(input),
      });

      await this.toRoles(MAINTENANCE_SUPERVISOR_ROLES, message);
    });
  }

  async notifyCorrectiveAssigned(
    input: Location & { id: string | number; assigneeId: number },
  ): Promise<void> {
    await this.safe(async () => {
      const message = correctiveAssigned({
        id: input.id,
        location: this.formatLocation(input),
      });

      await this.toEmployee(input.assigneeId, message);
    });
  }

  async notifyCorrectiveCompleted(
    input: Location & { id: string | number; assigneeName?: string | null },
  ): Promise<void> {
    await this.safe(async () => {
      const message = correctiveCompleted({
        id: input.id,
        assigneeName: input.assigneeName?.trim() || 'El técnico asignado',
        location: this.formatLocation(input),
      });

      await this.toRoles(MAINTENANCE_SUPERVISOR_ROLES, message);
    });
  }

  // ─── Preventivos ────────────────────────────────────────────────────────────

  async notifyPreventivePlanning(input: {
    id: string | number;
    planName: string;
    horizon: '30d' | '2d';
  }): Promise<void> {
    await this.safe(async () => {
      const message = preventivePlanning(input);
      await this.toRoles(MAINTENANCE_SUPERVISOR_ROLES, message);
    });
  }

  async notifyPreventiveAssigned(input: {
    id: string | number;
    assigneeId: number;
    assetName?: string | null;
    buildingName?: string | null;
  }): Promise<void> {
    await this.safe(async () => {
      const message = preventiveAssigned({
        id: input.id,
        location: joinLocation(input.assetName, input.buildingName),
      });

      await this.toEmployee(input.assigneeId, message);
    });
  }

  async notifyPreventiveSuspended(input: {
    id: string | number;
    assigneeName?: string | null;
    assetName?: string | null;
    buildingName?: string | null;
  }): Promise<void> {
    await this.safe(async () => {
      const message = preventiveSuspended({
        id: input.id,
        assigneeName: input.assigneeName?.trim() || 'El técnico asignado',
        location: joinLocation(input.assetName, input.buildingName),
      });

      await this.toRoles(MAINTENANCE_SUPERVISOR_ROLES, message);
    });
  }

  /** Al cesionario: vuelve a tener el trabajo en sus manos. */
  async notifyPreventiveResumed(input: {
    id: string | number;
    assigneeId: number;
    supervisorName?: string | null;
    assetName?: string | null;
    buildingName?: string | null;
  }): Promise<void> {
    await this.safe(async () => {
      const message = preventiveResumed({
        id: input.id,
        supervisorName: input.supervisorName?.trim() || 'El supervisor',
        location: joinLocation(input.assetName, input.buildingName),
      });

      await this.toEmployee(input.assigneeId, message);
    });
  }

  // ─── Limpieza ───────────────────────────────────────────────────────────────

  async notifyCleaningAssigned(
    input: Location & { id: string | number; cleaningEmployeeId: number },
  ): Promise<void> {
    await this.safe(async () => {
      const message = cleaningAssigned({
        id: input.id,
        location: this.formatLocation(input),
      });

      await this.toCleaningEmployee(input.cleaningEmployeeId, message);
    });
  }

  async notifyCleaningDelayed(
    input: Location & { id: string | number; cleaningEmployeeId: number },
  ): Promise<void> {
    await this.safe(async () => {
      const message = cleaningDelayed({
        id: input.id,
        location: this.formatLocation(input),
      });

      await this.toCleaningEmployee(input.cleaningEmployeeId, message);
    });
  }

  async notifyCleaningCompleted(
    input: Location & { id: string | number; employeeName?: string | null },
  ): Promise<void> {
    await this.safe(async () => {
      const message = cleaningCompleted({
        id: input.id,
        employeeName: input.employeeName?.trim() || 'El empleado asignado',
        location: this.formatLocation(input),
      });

      await this.toRoles(CLEANING_SUPERVISOR_ROLES, message);
    });
  }

  /** Reserva el evento y notifica solo la primera vez. Para los schedulers. */
  async claimDispatch(eventKey: string): Promise<boolean> {
    return this.repository.claimDispatch(eventKey);
  }

  // ─── Interno ────────────────────────────────────────────────────────────────

  /**
   * El spec pide la planta cuando el incidente no tiene unidad inmobiliaria.
   * El activo, cuando lo hay, es más preciso que ambas y las sustituye; solo
   * la apertura de correctivo lo envía.
   */
  private formatLocation(
    location: Location & { assetName?: string | null },
  ): string {
    return joinLocation(
      location.assetName ?? location.unitName ?? location.floorName,
      location.buildingName,
    );
  }

  private async toRoles(roles: string[], message: PushMessage): Promise<void> {
    await this.dispatch(await this.repository.findByRoles(roles), message);
  }

  private async toEmployee(
    employeeId: number,
    message: PushMessage,
  ): Promise<void> {
    await this.dispatch(
      await this.repository.findByEmployeeId(employeeId),
      message,
    );
  }

  private async toCleaningEmployee(
    cleaningEmployeeId: number,
    message: PushMessage,
  ): Promise<void> {
    await this.dispatch(
      await this.repository.findByCleaningEmployeeId(cleaningEmployeeId),
      message,
    );
  }

  private async dispatch(
    subscriptions: PushSubscription[],
    message: PushMessage,
  ): Promise<void> {
    if (subscriptions.length === 0) return;

    // Una entrada de historial por persona, aunque tenga varios dispositivos.
    const userIds = [...new Set(subscriptions.map((sub) => sub.userId))];
    await Promise.all(
      userIds.map((userId) =>
        this.repository.saveNotification(userId, message),
      ),
    );

    await this.sender.send(subscriptions, message);
  }

  private async safe(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar: ${(error as Error)?.message ?? error}`,
      );
    }
  }
}
