import { Injectable, Logger } from '@nestjs/common';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import {
  PmStatusId,
  PREVENTIVE_MAINT_PROCESS,
} from './constants/preventive-maint.constants';

/**
 * Instancia del proceso `PreventiveMaint` tal como la devuelve OpenMAINT.
 * Los atributos con prefijo `_` son las descripciones resueltas de las
 * referencias y lookups; el atributo sin prefijo es el ID numérico.
 */
export type PreventiveMaintCard = {
  _id: number;
  Number?: string | null;
  ShortDescr?: string | null;
  ProcessStatus?: number | null;
  _ProcessStatus_code?: string | null;
  _ProcessStatus_description?: string | null;
  _ProcessStatus_description_translation?: string | null;
  _FlowStatus_code?: string | null;
  Site?: number | null;
  _Site_description?: string | null;
  Assignee?: number | null;
  _Assignee_description?: string | null;
  Team?: number | null;
  _Team_description?: string | null;
  /** Plan preventivo del que se generó la instancia */
  PrevMaintConfig?: number | null;
  _PrevMaintConfig_description?: string | null;
  /** Equipo/activo sobre el que se ejecuta el mantenimiento */
  CISubset?: number | null;
  _CISubset_description?: string | null;
  CI?: number | null;
  _CI_description?: string | null;
  OpeningDate?: string | null;
  ExpExecStartDate?: string | null;
  DueExecEndDate?: string | null;
  ExecStartDate?: string | null;
  ExecEndDate?: string | null;
  /** Bitácora en HTML. OpenMAINT la expone como `Register` y/o `_Register_html`. */
  Register?: string | null;
  _Register_html?: string | null;
};

export type PreventiveMaintCardsResponse = {
  success?: boolean;
  data?: PreventiveMaintCard[];
  meta?: { total?: number };
};

export type PreventiveMaintCardResponse = {
  success?: boolean;
  data?: PreventiveMaintCard;
};

export type PreventiveMaintAttachment = {
  _id: string;
  name?: string;
  fileName?: string;
};

export type PreventiveMaintAttachmentsResponse = {
  success?: boolean;
  data?: PreventiveMaintAttachment[];
};

export type PreventiveMaintAttachmentPreviewResponse = {
  data?: {
    hasPreview?: boolean;
    dataUrl?: string;
  };
};

export type FindByAssigneeOptions = {
  limit: number;
  offset: number;
  statusId?: PmStatusId;
};

const INSTANCES_PATH = `/processes/${PREVENTIVE_MAINT_PROCESS}/instances`;

/**
 * Gateway hacia el proceso `PreventiveMaint` de OpenMAINT.
 *
 * Concentra aquí la construcción de rutas, filtros y tipos crudos para que
 * `PreventiveMaintenanceService` solo tenga que traducir al contrato público.
 */
@Injectable()
export class PreventiveMaintenanceOpenmaintService {
  private readonly logger = new Logger(
    PreventiveMaintenanceOpenmaintService.name,
  );

  constructor(private readonly client: OpenmaintClient) {}

  /** Mantenimientos preventivos asignados a un empleado (`Assignee`). */
  async findByAssignee(
    sessionId: string,
    employeeId: number,
    { limit, offset, statusId }: FindByAssigneeOptions,
  ): Promise<PreventiveMaintCardsResponse> {
    const params = new URLSearchParams({
      include_tasklist: 'false',
      onlyGridAttrs: 'true',
      start: String(offset),
      limit: String(limit),
      sort: JSON.stringify([{ property: 'Sorting', direction: 'DESC' }]),
      filter: JSON.stringify(this.buildAssigneeFilter(employeeId, statusId)),
    });

    this.logger.log(
      `Consultando mantenimientos preventivos de Assignee=${employeeId}` +
        (statusId ? ` con ProcessStatus=${statusId}` : ''),
    );

    return (await this.client.get(
      `${INSTANCES_PATH}?${params.toString()}`,
      sessionId,
    )) as PreventiveMaintCardsResponse;
  }

  async findById(
    sessionId: string,
    id: number,
  ): Promise<PreventiveMaintCardResponse> {
    return (await this.client.get(
      `${INSTANCES_PATH}/${id}`,
      sessionId,
    )) as PreventiveMaintCardResponse;
  }

  async findAttachments(
    sessionId: string,
    id: number,
  ): Promise<PreventiveMaintAttachmentsResponse> {
    return (await this.client.get(
      `${INSTANCES_PATH}/${id}/attachments`,
      sessionId,
    )) as PreventiveMaintAttachmentsResponse;
  }

  async findAttachmentPreview(
    sessionId: string,
    id: number,
    attachmentId: string,
  ): Promise<PreventiveMaintAttachmentPreviewResponse> {
    return (await this.client.get(
      `${INSTANCES_PATH}/${id}/attachments/${attachmentId}/preview`,
      sessionId,
    )) as PreventiveMaintAttachmentPreviewResponse;
  }

  /**
   * Filtro de OpenMAINT: una condición simple cuando solo hay `Assignee`, y un
   * `and` cuando además se filtra por estado.
   *
   * Importante: en los endpoints de procesos el `and` va *dentro* de
   * `attribute` (`{attribute:{and:[{simple}, {simple}]}}`). La forma inversa
   * (`{and:[{attribute}]}`) devuelve un error 500 de CMDBuild.
   */
  private buildAssigneeFilter(employeeId: number, statusId?: PmStatusId) {
    const assignee = {
      simple: {
        attribute: 'Assignee',
        operator: 'equal',
        value: [String(employeeId)],
      },
    };

    if (!statusId) {
      return { attribute: assignee };
    }

    const status = {
      simple: {
        attribute: 'ProcessStatus',
        operator: 'equal',
        value: [String(statusId)],
      },
    };

    return { attribute: { and: [assignee, status] } };
  }
}
