import { Injectable, Logger } from '@nestjs/common';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import {
  CmStatusId,
  CORRECTIVE_MAINT_PROCESS,
} from './constants/corrective-maint.constants';

/**
 * Instancia del proceso `CorrectiveMaint` tal como la devuelve OpenMAINT.
 * Los atributos con prefijo `_` son las descripciones resueltas de las
 * referencias y lookups; el atributo sin prefijo es el ID numérico.
 */
export type CorrectiveMaintCard = {
  _id: number;
  Number?: string | null;
  ShortDescr?: string | null;
  ProcessStatus?: number | null;
  _ProcessStatus_code?: string | null;
  _ProcessStatus_description?: string | null;
  _ProcessStatus_description_translation?: string | null;
  _FlowStatus_code?: string | null;
  Priority?: number | null;
  _Priority_description?: string | null;
  _Priority_description_translation?: string | null;
  Site?: number | null;
  _Site_description?: string | null;
  Floor?: number | null;
  _Floor_description?: string | null;
  Unit?: number | null;
  _Unit_description?: string | null;
  CommonArea?: number | null;
  _CommonArea_description?: string | null;
  Assignee?: number | null;
  _Assignee_description?: string | null;
  Team?: number | null;
  _Team_description?: string | null;
  Requester?: number | null;
  _Requester_description?: string | null;
  OpeningDate?: string | null;
  /** Fecha *prevista* de inicio; escribible solo en CM02 */
  ExpExecStartDate?: string | null;
  DueAssignEndDate?: string | null;
  ExecStartDate?: string | null;
  DueExecEndDate?: string | null;
  ExecEndDate?: string | null;
  ClosureDate?: string | null;
  /** Bitácora en HTML. OpenMAINT la expone como `Register` y/o `_Register_html`. */
  Register?: string | null;
  _Register_html?: string | null;
  /** Presente solo si se pide `include_tasklist=true` */
  _tasklist?: CorrectiveMaintTask[];
};

export type CorrectiveMaintTask = {
  _id: string;
  _definition?: string;
  description?: string;
  writable?: boolean;
  performer?: string;
};

export type CorrectiveMaintCardsResponse = {
  success?: boolean;
  data?: CorrectiveMaintCard[];
  meta?: { total?: number };
};

export type CorrectiveMaintCardResponse = {
  success?: boolean;
  data?: CorrectiveMaintCard;
};

export type FindAllOptions = {
  limit: number;
  offset: number;
  /** Estados a incluir. Vacío o ausente = sin filtro por estado. */
  statusIds?: CmStatusId[];
  /**
   * `true` → solo los que ya tienen cesionario; `false` → solo los que no lo
   * tienen; `undefined` → sin filtrar.
   */
  assigned?: boolean;
};

export type AdvanceOptions = {
  /** `_id` de la tarea activa (`_tasklist[0]._id`) */
  activityId: string;
  /** ID (no código) del lookup `Process - Action` */
  action: number;
  outcome?: number;
  notes?: string | null;
  /**
   * Atributos obligatorios del paso. OpenMAINT responde 200 y guarda los
   * atributos pero NO avanza el flujo si falta alguno.
   */
  fields?: Record<string, unknown>;
};

export type SaveFieldsOptions = {
  activityId: string;
  fields: Record<string, unknown>;
};

/** Condición de filtro de OpenMAINT, ya sea simple o compuesta. */
type FilterCondition =
  | { simple: { attribute: string; operator: string; value?: string[] } }
  | { or: FilterCondition[] }
  | { and: FilterCondition[] };

const INSTANCES_PATH = `/processes/${CORRECTIVE_MAINT_PROCESS}/instances`;

/**
 * Gateway hacia el proceso `CorrectiveMaint` de OpenMAINT.
 *
 * Existe porque el módulo de incidentes solo sabe crear (CM01) y cerrar (CM03):
 * no hay consultas con filtros compuestos ni paginación. Esta clase replica la
 * estructura de `PreventiveMaintenanceOpenmaintService`, incluidas sus dos
 * trampas ya documentadas de CMDBuild (ver `buildFilter` y `statusCondition`).
 */
@Injectable()
export class CorrectiveMaintOpenmaintService {
  private readonly logger = new Logger(CorrectiveMaintOpenmaintService.name);

  constructor(private readonly client: OpenmaintClient) {}

  /**
   * Todos los correctivos visibles para la sesión. A diferencia de
   * `getIncidentsByAssignee`, aquí **no** se filtra por `Assignee`: OpenMAINT
   * ya recorta el resultado según los permisos de grupo del usuario.
   */
  async findAll(
    sessionId: string,
    { limit, offset, statusIds, assigned }: FindAllOptions,
  ): Promise<CorrectiveMaintCardsResponse> {
    const params = new URLSearchParams({
      include_tasklist: 'false',
      onlyGridAttrs: 'true',
      start: String(offset),
      limit: String(limit),
      sort: JSON.stringify([{ property: 'Sorting', direction: 'DESC' }]),
      filter: JSON.stringify(
        this.buildFilter([
          this.statusCondition(statusIds),
          this.assignedCondition(assigned),
        ]),
      ),
    });

    this.logger.log(
      'Consultando correctivos' +
        (statusIds?.length ? ` con ProcessStatus in [${statusIds.join(',')}]` : '') +
        (assigned === undefined ? '' : ` y assigned=${assigned}`),
    );

    return (await this.client.get(
      `${INSTANCES_PATH}?${params.toString()}`,
      sessionId,
    )) as CorrectiveMaintCardsResponse;
  }

  /** Cuántos correctivos hay en un estado dado, sin traerse las tarjetas. */
  async countByStatus(
    sessionId: string,
    statusId: CmStatusId,
  ): Promise<number> {
    const params = new URLSearchParams({
      include_tasklist: 'false',
      onlyGridAttrs: 'true',
      start: '0',
      limit: '1',
      filter: JSON.stringify(this.buildFilter([this.statusCondition([statusId])])),
    });

    const response = (await this.client.get(
      `${INSTANCES_PATH}?${params.toString()}`,
      sessionId,
    )) as CorrectiveMaintCardsResponse;

    return response.meta?.total ?? 0;
  }

  async findById(
    sessionId: string,
    id: number,
  ): Promise<CorrectiveMaintCardResponse> {
    return (await this.client.get(
      `${INSTANCES_PATH}/${id}`,
      sessionId,
    )) as CorrectiveMaintCardResponse;
  }

  /** Instancia junto a su tarea activa, necesaria para avanzar el flujo. */
  async findWithTasklist(
    sessionId: string,
    id: number,
  ): Promise<CorrectiveMaintCardResponse> {
    return (await this.client.get(
      `${INSTANCES_PATH}/${id}?include_tasklist=true`,
      sessionId,
    )) as CorrectiveMaintCardResponse;
  }

  /** Ejecuta una acción del flujo de trabajo sobre la tarea activa. */
  async advance(
    sessionId: string,
    id: number,
    { activityId, action, outcome, notes, fields }: AdvanceOptions,
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      _id: id,
      _type: CORRECTIVE_MAINT_PROCESS,
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
   * Guarda atributos del paso actual sin avanzar el flujo (el botón «Guardar»
   * de OpenMAINT). Ignora en silencio los que el paso no declare escribibles.
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
        _type: CORRECTIVE_MAINT_PROCESS,
        _activity: activityId,
        _advance: false,
        ...fields,
      },
      sessionId,
    );
  }

  /**
   * Compone el filtro de OpenMAINT descartando las condiciones vacías.
   *
   * Importante: en los endpoints de procesos el `and`/`or` va *dentro* de
   * `attribute` (`{attribute:{and:[{simple}, {or:[...]}]}}`). La forma inversa
   * (`{and:[{attribute}]}`) devuelve un error 500 de CMDBuild.
   */
  private buildFilter(conditions: (FilterCondition | null)[]) {
    const present = conditions.filter(
      (condition): condition is FilterCondition => condition !== null,
    );

    if (present.length === 0) {
      return {};
    }

    return {
      attribute: present.length === 1 ? present[0] : { and: present },
    };
  }

  private equals(attribute: string, value: number): FilterCondition {
    return { simple: { attribute, operator: 'equal', value: [String(value)] } };
  }

  /**
   * `equal` con varios valores no funciona como `IN`: hay que componer un `or`.
   */
  private statusCondition(statusIds?: CmStatusId[]): FilterCondition | null {
    if (!statusIds?.length) {
      return null;
    }

    const conditions = statusIds.map((statusId) =>
      this.equals('ProcessStatus', statusId),
    );

    return conditions.length === 1 ? conditions[0] : { or: conditions };
  }

  /** Con o sin cesionario, para aislar los que esperan asignación. */
  private assignedCondition(assigned?: boolean): FilterCondition | null {
    if (assigned === undefined) {
      return null;
    }

    return {
      simple: {
        attribute: 'Assignee',
        operator: assigned ? 'isnotnull' : 'isnull',
      },
    };
  }
}
