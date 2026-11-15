import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { describeError } from '../../common/logging/describe-error.util';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import type {
  AttachmentCard,
  CleaningActivityCard,
  CleaningTaskCard,
} from './cleaning-tasks.openmaint.service';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';
import {
  FINDING_CLASS,
  SUPERVISION_CLASS,
  SUPERVISION_PHASE_LOOKUP,
  SUPERVISION_TEMPLATE_CODE,
  SupervisionPhase,
} from './constants/supervision.constants';

export type SupervisionCard = {
  _id: number;
  Code?: string | null;
  Description?: string | null;
  CleaningTask?: number | null;
  _CleaningTask_description?: string | null;
  Unit?: number | null;
  _Unit_description?: string | null;
  /** Corrector: el operario que arregla las novedades. */
  Employee?: number | null;
  _Employee_description?: string | null;
  Phase?: number | null;
  _Phase_code?: string | null;
  _Phase_description?: string | null;
  Supervisor?: number | null;
  _Supervisor_description?: string | null;
  Checklist?: number | null;
  _beginDate?: string | null;
};

export type FindingCard = {
  _id: number;
  /** Hoy guarda la marca provisional «Resuelto por supervisor». */
  Description?: string | null;
  /** El atributo de `OPENMAINT_FINDING_RESOLVED_ATTRIBUTE`, cuando exista. */
  [attribute: string]: unknown;
  Supervision?: number | null;
  Index?: number | null;
  Subcategory?: number | null;
  _Subcategory_description?: string | null;
  Observation?: string | null;
};

type CardsResponse<T> = {
  success?: boolean;
  data?: T[];
  meta?: { total?: number };
};
type CardResponse<T> = { success?: boolean; data?: T };

type LookupValue = { _id: number; code?: string; description?: string };

/** Los listados de esta clase son cortos: una tarjeta por limpieza supervisada. */
const RECENT_LIMIT = 500;

const NEWEST_FIRST = `&sort=${encodeURIComponent(
  JSON.stringify([{ property: '_id', direction: 'DESC' }]),
)}`;

const equalFilter = (attribute: string, value: number | string) =>
  `&filter=${encodeURIComponent(
    JSON.stringify({
      attribute: { simple: { attribute, operator: 'equal', value: [value] } },
    }),
  )}`;

/** Código HTTP de un error de axios (en la respuesta) o de Nest (en el propio error). */
const httpStatus = (error: unknown): number | undefined => {
  const e = error as {
    status?: number;
    response?: { status?: number };
  } | null;
  return e?.response?.status ?? e?.status;
};

/** Ids del lookup de fase; cambian entre ambientes, así que se leen y se cachean. */
const LOOKUP_CACHE_MS = 30 * 60_000;

/**
 * Acceso a `CleaningSupervision` y `CleaningFinding` en openMAINT.
 *
 * Todo va con la sesión de servicio: los grupos de los usuarios no siempre
 * pueden leer estas clases y, sobre todo, la autorización la decide el
 * backend (rol y propiedad), no las ACL de openMAINT.
 *
 * Filtros: solo `equal`, el único operador probado en este repo; lo demás se
 * filtra en memoria.
 */
@Injectable()
export class CleaningSupervisionsOpenmaintService {
  private readonly logger = new Logger(
    CleaningSupervisionsOpenmaintService.name,
  );
  private phaseIds: Map<SupervisionPhase, number> | null = null;
  private phaseIdsAt = 0;

  constructor(
    private readonly client: OpenmaintClient,
    private readonly sessionService: CleaningTasksSessionService,
  ) {}

  /** Igual que en `CleaningTasksOpenmaintService`: un 401 renueva la sesión y reintenta una vez. */
  private async run<T>(
    operation: (sessionId: string) => Promise<T>,
    operationName: string,
  ): Promise<T> {
    try {
      return await operation(await this.sessionService.getSessionId());
    } catch (error) {
      if (httpStatus(error) === 401) {
        this.logger.warn(
          `401 en ${operationName}: se renueva la sesión de servicio y se reintenta`,
        );
        await this.sessionService.refreshSession();
        return operation(await this.sessionService.getSessionId());
      }
      throw error;
    }
  }

  /** Envuelve un fallo de openMAINT en un 500 con mensaje legible y deja el detalle en el log. */
  private async call<T>(
    operation: (sessionId: string) => Promise<T>,
    operationName: string,
    userMessage: string,
  ): Promise<T> {
    try {
      return await this.run(operation, operationName);
    } catch (error) {
      this.logger.error(`${operationName} — ${describeError(error)}`);
      throw new InternalServerErrorException(userMessage);
    }
  }

  // ─── Lookup de fase ─────────────────────────────────────────────────────────

  async getPhaseIds(): Promise<Map<SupervisionPhase, number>> {
    if (this.phaseIds && Date.now() - this.phaseIdsAt < LOOKUP_CACHE_MS) {
      return this.phaseIds;
    }
    const response = await this.call(
      (sessionId) =>
        this.client.get(
          `/lookup_types/${encodeURIComponent(SUPERVISION_PHASE_LOOKUP)}/values?limit=100`,
          sessionId,
        ) as Promise<CardsResponse<LookupValue>>,
      'getSupervisionPhaseIds',
      'No se pudieron leer las fases de supervisión en OpenMAINT',
    );
    const map = new Map<SupervisionPhase, number>();
    for (const value of response?.data ?? []) {
      if (value.code) map.set(value.code as SupervisionPhase, value._id);
    }
    this.phaseIds = map;
    this.phaseIdsAt = Date.now();
    return map;
  }

  async phaseId(phase: SupervisionPhase): Promise<number> {
    const id = (await this.getPhaseIds()).get(phase);
    if (!id) {
      throw new InternalServerErrorException(
        `El lookup ${SUPERVISION_PHASE_LOOKUP} no tiene el valor ${phase}`,
      );
    }
    return id;
  }

  // ─── Supervisiones ──────────────────────────────────────────────────────────

  async getSupervision(id: number): Promise<SupervisionCard | null> {
    try {
      const response = (await this.run(
        (sessionId) =>
          this.client.get(
            `/classes/${SUPERVISION_CLASS}/cards/${id}`,
            sessionId,
          ),
        'getSupervision',
      )) as CardResponse<SupervisionCard>;
      return response?.data ?? null;
    } catch (error) {
      // openMAINT responde 404 (o 400) a un id inexistente.
      const status = httpStatus(error);
      if (status === 404 || status === 400) return null;
      this.logger.error(`getSupervision ${id} — ${describeError(error)}`);
      throw new InternalServerErrorException(
        'No se pudo leer la supervisión en OpenMAINT',
      );
    }
  }

  /** Supervisiones de una limpieza, la más reciente primero. */
  async findByTask(taskId: number): Promise<SupervisionCard[]> {
    return this.findBy('CleaningTask', taskId, 'findSupervisionsByTask');
  }

  /** Supervisiones de una unidad, la más reciente primero. */
  async findByUnit(unitId: number): Promise<SupervisionCard[]> {
    return this.findBy('Unit', unitId, 'findSupervisionsByUnit');
  }

  /** Supervisiones cuyo Corrector es este empleado, la más reciente primero. */
  async findByCorrector(employeeId: number): Promise<SupervisionCard[]> {
    return this.findBy('Employee', employeeId, 'findSupervisionsByCorrector');
  }

  /** Las últimas supervisiones, para resumirlas en los listados de limpiezas. */
  async findRecent(limit = RECENT_LIMIT): Promise<SupervisionCard[]> {
    const response = await this.call(
      (sessionId) =>
        this.client.get(
          `/classes/${SUPERVISION_CLASS}/cards?limit=${limit}${NEWEST_FIRST}`,
          sessionId,
        ) as Promise<CardsResponse<SupervisionCard>>,
      'findRecentSupervisions',
      'No se pudieron leer las supervisiones en OpenMAINT',
    );
    return response?.data ?? [];
  }

  private async findBy(
    attribute: string,
    value: number,
    operationName: string,
  ): Promise<SupervisionCard[]> {
    const response = await this.call(
      (sessionId) =>
        this.client.get(
          `/classes/${SUPERVISION_CLASS}/cards?limit=${RECENT_LIMIT}${NEWEST_FIRST}${equalFilter(attribute, value)}`,
          sessionId,
        ) as Promise<CardsResponse<SupervisionCard>>,
      operationName,
      'No se pudieron leer las supervisiones en OpenMAINT',
    );
    return response?.data ?? [];
  }

  async createSupervision(
    body: Record<string, unknown>,
  ): Promise<SupervisionCard> {
    const response = await this.call(
      (sessionId) =>
        this.client.post(
          `/classes/${SUPERVISION_CLASS}/cards`,
          body,
          sessionId,
        ) as Promise<CardResponse<SupervisionCard>>,
      'createSupervision',
      'No se pudo crear la supervisión en OpenMAINT',
    );
    if (!response?.data?._id) {
      throw new InternalServerErrorException(
        'OpenMAINT no devolvió el id de la supervisión',
      );
    }
    return response.data;
  }

  /** PUT parcial: openMAINT conserva los atributos que no llegan (comprobado el 14/11). */
  async updateSupervision(
    id: number,
    body: Record<string, unknown>,
  ): Promise<SupervisionCard | null> {
    const response = await this.call(
      (sessionId) =>
        this.client.put(
          `/classes/${SUPERVISION_CLASS}/cards/${id}`,
          body,
          sessionId,
        ) as Promise<CardResponse<SupervisionCard>>,
      'updateSupervision',
      'No se pudo actualizar la supervisión en OpenMAINT',
    );
    return response?.data ?? null;
  }

  // ─── Novedades ──────────────────────────────────────────────────────────────

  async listFindings(supervisionId: number): Promise<FindingCard[]> {
    const response = await this.call(
      (sessionId) =>
        this.client.get(
          `/classes/${FINDING_CLASS}/cards?limit=200${equalFilter('Supervision', supervisionId)}`,
          sessionId,
        ) as Promise<CardsResponse<FindingCard>>,
      'listFindings',
      'No se pudieron leer las novedades en OpenMAINT',
    );
    return response?.data ?? [];
  }

  async createFinding(body: Record<string, unknown>): Promise<FindingCard> {
    const response = await this.call(
      (sessionId) =>
        this.client.post(
          `/classes/${FINDING_CLASS}/cards`,
          body,
          sessionId,
        ) as Promise<CardResponse<FindingCard>>,
      'createFinding',
      'No se pudo guardar la novedad en OpenMAINT',
    );
    if (!response?.data?._id) {
      throw new InternalServerErrorException(
        'OpenMAINT no devolvió el id de la novedad',
      );
    }
    return response.data;
  }

  async updateFinding(
    id: number,
    body: Record<string, unknown>,
  ): Promise<FindingCard | null> {
    const response = await this.call(
      (sessionId) =>
        this.client.put(
          `/classes/${FINDING_CLASS}/cards/${id}`,
          body,
          sessionId,
        ) as Promise<CardResponse<FindingCard>>,
      'updateFinding',
      'No se pudo actualizar la novedad en OpenMAINT',
    );
    return response?.data ?? null;
  }

  /** Borrar la tarjeta se lleva también sus adjuntos. */
  async deleteFinding(id: number): Promise<void> {
    await this.call(
      (sessionId) =>
        this.client.delete(`/classes/${FINDING_CLASS}/cards/${id}`, sessionId),
      'deleteFinding',
      'No se pudo borrar la novedad en OpenMAINT',
    );
  }

  // ─── Fotos de una novedad (adjuntos de CleaningFinding) ─────────────────────

  async listFindingAttachments(findingId: number): Promise<AttachmentCard[]> {
    const response = await this.call(
      (sessionId) =>
        this.client.get(
          `/classes/${FINDING_CLASS}/cards/${findingId}/attachments`,
          sessionId,
        ) as Promise<CardsResponse<AttachmentCard>>,
      'listFindingAttachments',
      'No se pudieron leer las fotos de la novedad en OpenMAINT',
    );
    return response?.data ?? [];
  }

  /** Sin categoría DMS: la clase no la exige (subida comprobada el 14/11). */
  async uploadFindingAttachment(
    findingId: number,
    file: { buffer: Buffer; mimetype: string },
    fileName: string,
  ): Promise<AttachmentCard | null> {
    const response = await this.call(
      (sessionId) => {
        // Un FormData por intento: el reintento tras un 401 no puede reusar el cuerpo.
        const formData = new globalThis.FormData();
        formData.append('attachment', JSON.stringify({ fileName }));
        formData.append(
          'file',
          new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
          fileName,
        );
        return this.client.postFormData(
          `/classes/${FINDING_CLASS}/cards/${findingId}/attachments`,
          formData,
          sessionId,
        ) as Promise<CardResponse<AttachmentCard>>;
      },
      'uploadFindingAttachment',
      'No se pudo subir la foto de la novedad a OpenMAINT',
    );
    return response?.data ?? null;
  }

  async deleteFindingAttachment(
    findingId: number,
    attachmentId: string,
  ): Promise<void> {
    await this.call(
      (sessionId) =>
        this.client.delete(
          `/classes/${FINDING_CLASS}/cards/${findingId}/attachments/${encodeURIComponent(attachmentId)}`,
          sessionId,
        ),
      'deleteFindingAttachment',
      'No se pudo borrar la foto de la novedad en OpenMAINT',
    );
  }

  async downloadFindingAttachment(
    findingId: number,
    attachmentId: string,
  ): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    return this.call(
      (sessionId) =>
        this.client.getBuffer(
          `/classes/${FINDING_CLASS}/cards/${findingId}/attachments/${encodeURIComponent(attachmentId)}/download`,
          sessionId,
        ),
      'downloadFindingAttachment',
      'No se pudo descargar la foto de la novedad desde OpenMAINT',
    );
  }

  // ─── Datos de referencia ────────────────────────────────────────────────────

  /** La tarjeta de `CleaningActivity` con `Code = SUPERVISION`, o null si no existe. */
  async findTemplateCard(): Promise<CleaningActivityCard | null> {
    const response = await this.call(
      (sessionId) =>
        this.client.get(
          `/classes/CleaningActivity/cards?limit=2${equalFilter('Code', SUPERVISION_TEMPLATE_CODE)}`,
          sessionId,
        ) as Promise<CardsResponse<CleaningActivityCard>>,
      'findSupervisionTemplate',
      'No se pudo leer el checklist de supervisión en OpenMAINT',
    );
    const cards = response?.data ?? [];
    if (cards.length > 1) {
      this.logger.warn(
        `Hay ${cards.length} checklists con Code=${SUPERVISION_TEMPLATE_CODE}; se usa el primero (${cards[0]._id})`,
      );
    }
    return cards[0] ?? null;
  }

  /** Limpiezas de una unidad, para saber si una limpieza ya fue superada por otra. */
  async findTasksByUnit(unitId: number): Promise<CleaningTaskCard[]> {
    const response = await this.call(
      (sessionId) =>
        this.client.get(
          `/classes/CleaningTask/cards?limit=${RECENT_LIMIT}${NEWEST_FIRST}${equalFilter('Unit', unitId)}`,
          sessionId,
        ) as Promise<CardsResponse<CleaningTaskCard>>,
      'findTasksByUnit',
      'No se pudieron leer las limpiezas de la unidad en OpenMAINT',
    );
    return response?.data ?? [];
  }
}
