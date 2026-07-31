import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import {
  PREV_MAINT_TASK_CLASS,
  PREV_MAINT_TASKS_CLASS,
} from './constants/checklist.constants';
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

export type UploadedImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

/**
 * Actividad del checklist tal como viaja dentro del campo `Data` (un string
 * JSON) de la tarjeta `PrevMaintTasks`.
 *
 * El índice de firma preserva las claves que OpenMAINT añade y que la app no
 * interpreta: al guardar hay que devolverlas intactas o el registro se rompe.
 */
export type ChecklistRawItem = {
  TaskDef: number;
  Type: number;
  ExecOrder: number;
  Outcome: string | number | null;
  ND: boolean;
  Modified: boolean;
  _TaskDef_description?: string | null;
  _CI_description?: string | null;
  [key: string]: unknown;
};

export type ChecklistCard = {
  _id: number;
  MaintProcess?: number;
  /** Array de `ChecklistRawItem` serializado */
  Data?: string | null;
};

export type ChecklistCardsResponse = {
  success?: boolean;
  data?: ChecklistCard[];
};

export type TaskDefinitionResponse = {
  success?: boolean;
  data?: {
    _id: number;
    Type?: number | null;
    LookupType?: number | null;
    /** Nombre del lookup a consultar, p. ej. `COMMON - Currency` */
    _LookupType_description?: string | null;
  };
};

export type LookupValue = {
  _id: number;
  code?: string | null;
  description?: string | null;
  _description_translation?: string | null;
  active?: boolean;
};

export type LookupValuesResponse = {
  success?: boolean;
  data?: LookupValue[];
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

export type SaveFieldsOptions = {
  /** `_id` de la tarea activa (`_tasklist[0]._id`) */
  activityId: string;
  fields: Record<string, unknown>;
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

  /**
   * Guarda atributos del paso actual sin avanzar el flujo, el equivalente al
   * botón «Guardar» de OpenMAINT. Solo admite los atributos que el paso declara
   * como escribibles; el resto se ignora en silencio.
   */
  async saveFields(
    sessionId: string,
    id: number,
    { activityId, fields }: SaveFieldsOptions,
  ): Promise<unknown> {
    return this.client.put(
      `${INSTANCES_PATH}/${id}`,
      {
        _id: id,
        _type: PREVENTIVE_MAINT_PROCESS,
        _activity: activityId,
        _advance: false,
        ...fields,
      },
      sessionId,
    );
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

  // ── Checklist (clase PrevMaintTasks) ───────────────────────────────────────

  /**
   * Tarjeta de checklist asociada a una instancia del proceso.
   *
   * Ojo: el atributo de enlace se llama `MaintProcess`, no `PreventiveMaint`;
   * filtrar por este último devuelve un 500 de CMDBuild.
   */
  async findChecklistCard(
    sessionId: string,
    processId: number,
  ): Promise<ChecklistCardsResponse> {
    const params = new URLSearchParams({
      limit: '1',
      filter: JSON.stringify({
        attribute: {
          simple: {
            attribute: 'MaintProcess',
            operator: 'equal',
            value: [String(processId)],
          },
        },
      }),
    });

    return (await this.client.get(
      `/classes/${PREV_MAINT_TASKS_CLASS}/cards?${params.toString()}`,
      sessionId,
    )) as ChecklistCardsResponse;
  }

  /** Sobrescribe el array de actividades serializado en `Data`. */
  async updateChecklistCard(
    sessionId: string,
    cardId: number,
    items: ChecklistRawItem[],
  ): Promise<unknown> {
    return this.client.put(
      `/classes/${PREV_MAINT_TASKS_CLASS}/cards/${cardId}`,
      {
        _id: cardId,
        _type: PREV_MAINT_TASKS_CLASS,
        Data: JSON.stringify(items),
      },
      sessionId,
    );
  }

  /** Definición de una actividad, necesaria para saber su `LookupType`. */
  async findTaskDefinition(
    sessionId: string,
    taskDefId: number,
  ): Promise<TaskDefinitionResponse> {
    return (await this.client.get(
      `/classes/${PREV_MAINT_TASK_CLASS}/cards/${taskDefId}`,
      sessionId,
    )) as TaskDefinitionResponse;
  }

  /** Valores de un lookup, para poblar las opciones de un desplegable. */
  async findLookupValues(
    sessionId: string,
    lookupName: string,
  ): Promise<LookupValuesResponse> {
    return (await this.client.get(
      `/lookup_types/${encodeURIComponent(lookupName)}/values?limit=500`,
      sessionId,
    )) as LookupValuesResponse;
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
