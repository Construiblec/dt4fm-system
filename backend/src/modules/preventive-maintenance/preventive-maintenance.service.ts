import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { extractRegisterNotes } from '../../common/utils/openmaint-register.util';
import {
  PM_ACTIONS,
  PM_ACTIVE_STATUS_IDS,
  PM_OUTCOME_POSITIVE,
  PM_STATUS_CODE_TO_NAME,
  PM_STATUS_IDS,
  PM_STATUS_NAME_TO_ID,
} from './constants/preventive-maint.constants';
import { CompletePreventiveMaintenanceDto } from './dto/complete-preventive-maintenance.dto';
import { GetMyPreventiveMaintenancesQueryDto } from './dto/get-my-preventive-maintenances-query.dto';
import {
  PreventiveMaintAttachment,
  PreventiveMaintAttachmentPreviewResponse,
  PreventiveMaintCard,
  PreventiveMaintenanceOpenmaintService,
  UploadedImage,
} from './preventive-maintenance.openmaint.service';

const IMAGE_FILE_REGEX = /\.(png|jpg|jpeg|webp)$/i;

/** Contrato público de un mantenimiento preventivo en el listado. */
export type PreventiveMaintenance = {
  id: number;
  number: string | null;
  subject: string | null;
  /** Identificador estable del estado, p. ej. `Execution` */
  statusCode: string | null;
  /** Etiqueta del estado traducida por OpenMAINT, p. ej. `Ejecución` */
  status: string | null;
  isClosed: boolean;
  isOverdue: boolean;
  site: string | null;
  /** Equipo/activo intervenido */
  equipment: string | null;
  /** Plan preventivo del que se generó */
  plan: string | null;
  team: string | null;
  assignee: string | null;
  openingDate: string | null;
  expectedStartDate: string | null;
  dueDate: string | null;
  execStartDate: string | null;
  execEndDate: string | null;
};

export type PreventiveMaintenanceDetail = PreventiveMaintenance & {
  notes: string | null;
  images: string[];
  /** El técnico puede cerrarlo (está en ejecución) */
  canComplete: boolean;
};

@Injectable()
export class PreventiveMaintenanceService {
  private readonly logger = new Logger(PreventiveMaintenanceService.name);

  constructor(
    private readonly openmaint: PreventiveMaintenanceOpenmaintService,
  ) {}

  async getMyPreventiveMaintenances(
    sessionId: string,
    employeeId: number,
    query: GetMyPreventiveMaintenancesQueryDto,
  ) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    // Sin filtro explícito se muestran solo los pendientes de atender; los
    // completados y cancelados desaparecen del dashboard por sí solos.
    const statusIds = query.status
      ? [PM_STATUS_NAME_TO_ID[query.status]]
      : PM_ACTIVE_STATUS_IDS;

    let response: Awaited<
      ReturnType<PreventiveMaintenanceOpenmaintService['findByAssignee']>
    >;

    try {
      response = await this.openmaint.findByAssignee(sessionId, employeeId, {
        limit,
        offset,
        statusIds,
      });
    } catch (error) {
      this.throwIfSessionExpired(error);

      throw new BadGatewayException(
        'Error al consultar mantenimientos preventivos en OpenMAINT',
      );
    }

    const cards = response.data ?? [];

    return {
      success: true,
      data: cards.map((card) => this.toPreventiveMaintenance(card)),
      meta: {
        total: response.meta?.total ?? cards.length,
        limit,
        offset,
      },
    };
  }

  async getPreventiveMaintenanceDetail(sessionId: string, id: number) {
    const card = await this.fetchCard(sessionId, id);

    return { success: true, data: await this.toDetail(sessionId, card) };
  }

  /**
   * Abre el mantenimiento para el técnico: si está en Aceptación lo avanza a
   * Ejecución en OpenMAINT. Es idempotente — si ya está en ejecución o cerrado
   * simplemente devuelve el detalle sin tocar el flujo.
   */
  async startExecution(sessionId: string, id: number) {
    const card = await this.fetchCardWithTasklist(sessionId, id);

    if (card.ProcessStatus === PM_STATUS_IDS.ACCEPTANCE) {
      const activityId = this.requireActivityId(card);

      this.logger.log(
        `Iniciando ejecución del mantenimiento preventivo ${card.Number ?? id}`,
      );

      await this.runAdvance(sessionId, id, {
        activityId,
        action: PM_ACTIONS.START_EXECUTION,
      });

      await this.assertReachedStatus(
        sessionId,
        id,
        PM_STATUS_IDS.EXECUTION,
        'OpenMAINT no aplicó el inicio de ejecución del mantenimiento preventivo',
      );
    }

    const updated = await this.fetchCard(sessionId, id);

    return { success: true, data: await this.toDetail(sessionId, updated) };
  }

  /** Cierra el mantenimiento (Ejecución → Completado) con notas y evidencia. */
  async completePreventiveMaintenance(
    sessionId: string,
    id: number,
    dto: CompletePreventiveMaintenanceDto,
    file?: UploadedImage,
  ) {
    const card = await this.fetchCardWithTasklist(sessionId, id);

    if (card.ProcessStatus !== PM_STATUS_IDS.EXECUTION) {
      throw new ConflictException(
        'Solo se puede finalizar un mantenimiento preventivo en ejecución',
      );
    }

    const activityId = this.requireActivityId(card);
    const now = new Date().toISOString();

    await this.runAdvance(sessionId, id, {
      activityId,
      action: PM_ACTIONS.CONCLUDE,
      outcome: PM_OUTCOME_POSITIVE,
      notes: dto.notes?.trim() || null,
      // PM03 exige ambas fechas; sin ellas OpenMAINT responde 200, guarda los
      // atributos y deja el proceso en ejecución sin avisar.
      fields: {
        ExecStartDate: card.ExecStartDate ?? now,
        ExecEndDate: now,
      },
    });

    // OpenMAINT bloquea el cierre mientras queden actividades del checklist
    // (`PrevMaintTasks.Data`) sin resultado, y lo hace respondiendo 200 sin
    // avanzar. Hasta que la app permita rellenar el checklist, ese es el
    // motivo más probable de que el cierre no se aplique.
    await this.assertReachedStatus(
      sessionId,
      id,
      PM_STATUS_IDS.COMPLETED,
      'OpenMAINT no aplicó el cierre. Revisa que el checklist del ' +
        'mantenimiento tenga todas sus actividades resueltas.',
    );

    // La evidencia es complementaria: si falla, el cierre ya está registrado.
    if (file) {
      try {
        await this.openmaint.uploadAttachment(sessionId, id, file);
      } catch (error) {
        this.logger.error(
          `No se pudo subir la evidencia del mantenimiento ${id}`,
          error,
        );
      }
    }

    return {
      success: true,
      message: 'Mantenimiento preventivo completado correctamente',
    };
  }

  // ── Acceso a OpenMAINT ─────────────────────────────────────────────────────

  private async fetchCard(
    sessionId: string,
    id: number,
  ): Promise<PreventiveMaintCard> {
    return this.unwrapCard(
      () => this.openmaint.findById(sessionId, id),
      'Error al consultar el mantenimiento preventivo en OpenMAINT',
    );
  }

  private async fetchCardWithTasklist(
    sessionId: string,
    id: number,
  ): Promise<PreventiveMaintCard> {
    return this.unwrapCard(
      () => this.openmaint.findWithTasklist(sessionId, id),
      'Error al obtener la actividad actual del mantenimiento en OpenMAINT',
    );
  }

  private async unwrapCard(
    fetch: () => Promise<{ data?: PreventiveMaintCard }>,
    gatewayMessage: string,
  ): Promise<PreventiveMaintCard> {
    let card: PreventiveMaintCard | undefined;

    try {
      const response = await fetch();
      card = response.data;
    } catch (error) {
      this.throwIfSessionExpired(error);

      // El único dato que aporta el cliente es el id, así que un rechazo por
      // petición inválida sólo puede significar que ese id no existe o no es
      // accesible para la sesión.
      const status = this.getErrorStatus(error);

      if (status === 404 || status === 400) {
        throw new NotFoundException('Mantenimiento preventivo no encontrado');
      }

      throw new BadGatewayException(gatewayMessage);
    }

    if (!card) {
      throw new NotFoundException('Mantenimiento preventivo no encontrado');
    }

    return card;
  }

  private async runAdvance(
    sessionId: string,
    id: number,
    options: Parameters<PreventiveMaintenanceOpenmaintService['advance']>[2],
  ): Promise<void> {
    try {
      await this.openmaint.advance(sessionId, id, options);
    } catch (error) {
      this.throwIfSessionExpired(error);

      throw new BadGatewayException(
        'Error al avanzar el mantenimiento preventivo en OpenMAINT',
      );
    }
  }

  /**
   * OpenMAINT responde 200 a un `_advance` aunque no avance (por ejemplo si
   * falta un atributo obligatorio del paso): guarda los atributos y deja el
   * proceso donde estaba. Sin esta comprobación le diríamos al técnico que su
   * mantenimiento quedó cerrado cuando en realidad sigue abierto.
   */
  private async assertReachedStatus(
    sessionId: string,
    id: number,
    expectedStatus: number,
    reason: string,
  ): Promise<void> {
    const card = await this.fetchCard(sessionId, id);

    if (card.ProcessStatus === expectedStatus) {
      return;
    }

    this.logger.error(
      `OpenMAINT aceptó el avance de ${card.Number ?? id} pero el proceso sigue en ` +
        `${card._ProcessStatus_code ?? card.ProcessStatus}`,
    );

    throw new BadGatewayException(reason);
  }

  /** `_id` de la tarea activa del flujo, necesario para avanzarlo. */
  private requireActivityId(card: PreventiveMaintCard): string {
    const activityId = card._tasklist?.[0]?._id;

    if (!activityId) {
      throw new BadRequestException(
        'El mantenimiento preventivo no tiene una actividad disponible',
      );
    }

    return activityId;
  }

  // ── Mapeo al contrato público ──────────────────────────────────────────────

  private async toDetail(
    sessionId: string,
    card: PreventiveMaintCard,
  ): Promise<PreventiveMaintenanceDetail> {
    return {
      ...this.toPreventiveMaintenance(card),
      notes: extractRegisterNotes(card.Register ?? card._Register_html ?? null),
      images: await this.getAttachmentImages(sessionId, card._id),
      canComplete: card.ProcessStatus === PM_STATUS_IDS.EXECUTION,
    };
  }

  /** Traduce una instancia de OpenMAINT al contrato público del módulo. */
  private toPreventiveMaintenance(
    card: PreventiveMaintCard,
  ): PreventiveMaintenance {
    const statusCode = card._ProcessStatus_code ?? null;
    const dueDate = card.DueExecEndDate ?? null;
    const isClosed = (card._FlowStatus_code ?? '').startsWith('closed');

    return {
      id: card._id,
      number: card.Number ?? null,
      subject: card.ShortDescr ?? null,
      statusCode: statusCode
        ? (PM_STATUS_CODE_TO_NAME[statusCode] ?? statusCode)
        : null,
      status:
        card._ProcessStatus_description_translation ??
        card._ProcessStatus_description ??
        null,
      isClosed,
      isOverdue: this.isOverdue(dueDate, isClosed),
      site: card._Site_description ?? null,
      equipment: card._CISubset_description ?? card._CI_description ?? null,
      plan: card._PrevMaintConfig_description ?? null,
      team: card._Team_description ?? null,
      assignee: card._Assignee_description ?? null,
      openingDate: card.OpeningDate ?? null,
      expectedStartDate: card.ExpExecStartDate ?? null,
      dueDate,
      execStartDate: card.ExecStartDate ?? null,
      execEndDate: card.ExecEndDate ?? null,
    };
  }

  /** Un preventivo está vencido si sigue abierto y ya pasó su fecha límite. */
  private isOverdue(dueDate: string | null, isClosed: boolean): boolean {
    if (isClosed || !dueDate) {
      return false;
    }

    const due = new Date(dueDate).getTime();

    return Number.isFinite(due) && due < Date.now();
  }

  /**
   * Descarga las vistas previas de los adjuntos de imagen como data URLs.
   * Los adjuntos son complementarios: si fallan, el detalle se devuelve igual.
   */
  private async getAttachmentImages(
    sessionId: string,
    id: number,
  ): Promise<string[]> {
    let attachments: PreventiveMaintAttachment[] = [];

    try {
      const response = await this.openmaint.findAttachments(sessionId, id);
      attachments = response.data ?? [];
    } catch {
      return [];
    }

    const images = attachments.filter((attachment) =>
      IMAGE_FILE_REGEX.test(attachment.name ?? attachment.fileName ?? ''),
    );

    const previews = await Promise.allSettled(
      images.map((attachment) =>
        this.openmaint.findAttachmentPreview(sessionId, id, attachment._id),
      ),
    );

    return previews
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<PreventiveMaintAttachmentPreviewResponse> =>
          result.status === 'fulfilled' &&
          result.value?.data?.hasPreview === true &&
          typeof result.value.data.dataUrl === 'string',
      )
      .map((result) => result.value.data!.dataUrl!);
  }

  // ── Errores ────────────────────────────────────────────────────────────────

  /**
   * Propaga el 401 de OpenMAINT tal cual en lugar de enmascararlo como 502.
   * El frontend usa ese status para redirigir al login cuando la sesión caduca;
   * si se traduce a 502 el usuario queda atascado con un error genérico.
   */
  private throwIfSessionExpired(error: unknown): void {
    if (this.getErrorStatus(error) === 401) {
      throw new UnauthorizedException('La sesión de OpenMAINT ha expirado');
    }
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response &&
      typeof error.response.status === 'number'
    ) {
      return error.response.status;
    }

    return undefined;
  }
}
