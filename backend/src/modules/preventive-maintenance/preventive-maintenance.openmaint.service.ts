import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import {
  OPENMAINT_TEAM_ROLE,
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
  /** Presente solo si se pide `include_tasklist=true` */
  _tasklist?: PreventiveMaintTask[];
};

export type PreventiveMaintTask = {
  _id: string;
  _definition?: string;
  description?: string;
  writable?: boolean;
  performer?: string;
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

type SessionResponse = {
  data?: { role?: string };
};

export type UploadedImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

export type FindByAssigneeOptions = {
  limit: number;
  offset: number;
  /** Estados a incluir. Vacío o ausente = sin filtro por estado. */
  statusIds?: PmStatusId[];
};

export type AdvanceOptions = {
  /** `_id` de la tarea activa (`_tasklist[0]._id`) */
  activityId: string;
  /** Código del lookup `Process - Action`, p. ej. `PM02-Advance` */
  action: string;
  outcome?: number;
  notes?: string | null;
  /**
   * Atributos obligatorios del paso. OpenMAINT responde 200 y guarda los
   * atributos pero NO avanza el flujo si falta alguno (p. ej. `ExecEndDate`
   * en PM03).
   */
  fields?: Record<string, unknown>;
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
    { limit, offset, statusIds }: FindByAssigneeOptions,
  ): Promise<PreventiveMaintCardsResponse> {
    const params = new URLSearchParams({
      include_tasklist: 'false',
      onlyGridAttrs: 'true',
      start: String(offset),
      limit: String(limit),
      sort: JSON.stringify([{ property: 'Sorting', direction: 'DESC' }]),
      filter: JSON.stringify(this.buildAssigneeFilter(employeeId, statusIds)),
    });

    this.logger.log(
      `Consultando mantenimientos preventivos de Assignee=${employeeId}` +
        (statusIds?.length
          ? ` con ProcessStatus in [${statusIds.join(',')}]`
          : ''),
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

  /** Instancia junto a su tarea activa, necesaria para avanzar el flujo. */
  async findWithTasklist(
    sessionId: string,
    id: number,
  ): Promise<PreventiveMaintCardResponse> {
    return (await this.client.get(
      `${INSTANCES_PATH}/${id}?include_tasklist=true`,
      sessionId,
    )) as PreventiveMaintCardResponse;
  }

  /** Ejecuta una acción del flujo de trabajo sobre la tarea activa. */
  async advance(
    sessionId: string,
    id: number,
    { activityId, action, outcome, notes, fields }: AdvanceOptions,
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      _id: id,
      _type: PREVENTIVE_MAINT_PROCESS,
      _activity: activityId,
      _advance: true,
      Action: action,
      ...fields,
    };

    if (outcome !== undefined) {
      body.Outcome = outcome;
    }

    if (notes !== undefined) {
      body.ProcessNotes = notes;
    }

    return this.client.put(`${INSTANCES_PATH}/${id}`, body, sessionId);
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

  async uploadAttachment(
    sessionId: string,
    id: number,
    file: UploadedImage,
  ): Promise<unknown> {
    const formData = new FormData();

    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    formData.append(
      'attachment',
      JSON.stringify({ fileName: file.originalname, majorVersion: true }),
    );

    return this.client.post(
      `${INSTANCES_PATH}/${id}/attachments`,
      formData,
      sessionId,
      { headers: formData.getHeaders() },
    );
  }

  /** Rol activo de la sesión, para poder restaurarlo tras una elevación. */
  async getSessionRole(sessionId: string): Promise<string | undefined> {
    const response = (await this.client.get(
      `/sessions/${sessionId}`,
      sessionId,
    )) as SessionResponse;

    return response.data?.role;
  }

  async setSessionRole(sessionId: string, role: string): Promise<void> {
    await this.client.put(`/sessions/${sessionId}`, { role }, sessionId);
  }

  /**
   * Ejecuta una operación garantizando el rol `Team`, que es el `performer` de
   * los pasos PM02/PM03. Si la sesión ya tiene ese rol no se toca nada; si no,
   * se eleva y se restaura el rol original al terminar (también si falla).
   */
  async withTeamRole<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    let previousRole: string | undefined;

    try {
      previousRole = await this.getSessionRole(sessionId);
    } catch {
      // Si no se puede leer el rol, se intenta la operación tal cual
      return operation();
    }

    if (previousRole === OPENMAINT_TEAM_ROLE) {
      return operation();
    }

    this.logger.log(
      `Elevando la sesión de rol "${previousRole ?? 'desconocido'}" a "${OPENMAINT_TEAM_ROLE}" para avanzar el flujo`,
    );

    await this.setSessionRole(sessionId, OPENMAINT_TEAM_ROLE);

    try {
      return await operation();
    } finally {
      if (previousRole) {
        await this.setSessionRole(sessionId, previousRole).catch((error) => {
          this.logger.error(
            `No se pudo restaurar el rol "${previousRole}" de la sesión`,
            error,
          );
        });
      }
    }
  }

  /**
   * Filtro de OpenMAINT: una condición simple cuando solo hay `Assignee`, y un
   * `and` cuando además se filtra por estado.
   *
   * Importante: en los endpoints de procesos el `and`/`or` va *dentro* de
   * `attribute` (`{attribute:{and:[{simple}, {or:[...]}]}}`). La forma inversa
   * (`{and:[{attribute}]}`) devuelve un error 500 de CMDBuild, y `equal` con
   * varios valores tampoco funciona como `IN`: hay que componer un `or`.
   */
  private buildAssigneeFilter(employeeId: number, statusIds?: PmStatusId[]) {
    const assignee = {
      simple: {
        attribute: 'Assignee',
        operator: 'equal',
        value: [String(employeeId)],
      },
    };

    if (!statusIds?.length) {
      return { attribute: assignee };
    }

    const statusConditions = statusIds.map((statusId) => ({
      simple: {
        attribute: 'ProcessStatus',
        operator: 'equal',
        value: [String(statusId)],
      },
    }));

    const status =
      statusConditions.length === 1
        ? statusConditions[0]
        : { or: statusConditions };

    return { attribute: { and: [assignee, status] } };
  }
}
