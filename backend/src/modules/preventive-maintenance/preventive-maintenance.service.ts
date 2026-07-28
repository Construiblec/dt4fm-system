import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { extractRegisterNotes } from '../../common/utils/openmaint-register.util';
import {
  PM_STATUS_CODE_TO_NAME,
  PM_STATUS_NAME_TO_ID,
} from './constants/preventive-maint.constants';
import { GetMyPreventiveMaintenancesQueryDto } from './dto/get-my-preventive-maintenances-query.dto';
import {
  PreventiveMaintAttachment,
  PreventiveMaintAttachmentPreviewResponse,
  PreventiveMaintCard,
  PreventiveMaintenanceOpenmaintService,
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
};

@Injectable()
export class PreventiveMaintenanceService {
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
    const statusId = query.status
      ? PM_STATUS_NAME_TO_ID[query.status]
      : undefined;

    let response: Awaited<
      ReturnType<PreventiveMaintenanceOpenmaintService['findByAssignee']>
    >;

    try {
      response = await this.openmaint.findByAssignee(sessionId, employeeId, {
        limit,
        offset,
        statusId,
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
    let card: PreventiveMaintCard | undefined;

    try {
      const response = await this.openmaint.findById(sessionId, id);
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

      throw new BadGatewayException(
        'Error al consultar el mantenimiento preventivo en OpenMAINT',
      );
    }

    if (!card) {
      throw new NotFoundException('Mantenimiento preventivo no encontrado');
    }

    const detail: PreventiveMaintenanceDetail = {
      ...this.toPreventiveMaintenance(card),
      notes: extractRegisterNotes(card.Register ?? card._Register_html ?? null),
      images: await this.getAttachmentImages(sessionId, id),
    };

    return { success: true, data: detail };
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
