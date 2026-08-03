import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CHECKLIST_FIELD_KINDS,
  ChecklistFieldKind,
  FIXED_OPTION_IDS_BY_KIND,
  PM_TASK_OUTCOME_LOOKUP,
} from './constants/checklist.constants';
import {
  ChecklistCard,
  ChecklistRawItem,
  LookupValue,
  PreventiveMaintenanceOpenmaintService,
} from './preventive-maintenance.openmaint.service';
import { LookupOption, toLookupOption } from './utils/lookup-option.util';

export type ChecklistOption = LookupOption;

/** Contrato público de una actividad del checklist. */
export type PreventiveChecklistItem = {
  order: number;
  /** Clave estable con la que el cliente devuelve la respuesta */
  taskDefId: number;
  label: string;
  kind: ChecklistFieldKind;
  value: string | number | null;
  isResolved: boolean;
  /** Equipo concreto sobre el que se ejecuta la actividad */
  equipment: string | null;
  /** Solo en los tipos con desplegable (`lookup`, `posneg`, `flag`) */
  options?: ChecklistOption[];
};

export type ChecklistAnswer = {
  taskDefId: number;
  value: string;
};

const KINDS_WITH_OPTIONS: ChecklistFieldKind[] = ['lookup', 'posneg', 'flag'];

/**
 * Checklist de una instancia de `PreventiveMaint`.
 *
 * OpenMAINT lo guarda como una única tarjeta de la clase `PrevMaintTasks` cuyo
 * campo `Data` es un array JSON serializado. Mientras alguna actividad quede
 * sin resolver, el proceso no puede avanzar a Completado: el `PUT` de avance
 * responde 200 y no hace nada.
 */
@Injectable()
export class PreventiveChecklistService {
  private readonly logger = new Logger(PreventiveChecklistService.name);

  constructor(
    private readonly openmaint: PreventiveMaintenanceOpenmaintService,
  ) {}

  /** Actividades del checklist, ordenadas y con sus opciones resueltas. */
  async getChecklist(
    sessionId: string,
    processId: number,
  ): Promise<PreventiveChecklistItem[]> {
    const card = await this.findCard(sessionId, processId);

    if (!card) {
      return [];
    }

    const rawItems = this.parseItems(card);

    return this.toChecklistItems(sessionId, rawItems);
  }

  /**
   * Escribe las respuestas conservando el resto del registro.
   *
   * El merge es deliberado: cada elemento de `Data` lleva claves que la app no
   * interpreta (`CI`, `Site`, `_*_description`…) y de las que OpenMAINT
   * depende, así que solo se tocan `Outcome` y `Modified`.
   */
  async saveChecklist(
    sessionId: string,
    processId: number,
    answers: ChecklistAnswer[],
  ): Promise<PreventiveChecklistItem[]> {
    const card = await this.requireCard(sessionId, processId);
    const rawItems = this.parseItems(card);

    const answerByTaskDef = new Map(
      answers.map((answer) => [answer.taskDefId, answer.value]),
    );

    const merged = rawItems.map((item) => {
      const answer = answerByTaskDef.get(item.TaskDef);

      if (answer === undefined) {
        return item;
      }

      return {
        ...item,
        Outcome: this.toOutcome(item.Type, answer),
        Modified: true,
      };
    });

    try {
      await this.openmaint.updateChecklistCard(sessionId, card._id, merged);
    } catch (error) {
      this.logger.error(
        `No se pudo guardar el checklist del mantenimiento ${processId}`,
        error,
      );

      throw new BadGatewayException(
        'Error al guardar el checklist en OpenMAINT',
      );
    }

    return this.toChecklistItems(sessionId, merged);
  }

  /**
   * Marca como N.D. las actividades que siguen sin resultado y devuelve
   * cuántas cambiaron. Es lo que permite salir de PM03 al suspender: mientras
   * quede alguna sin resolver, OpenMAINT responde 200 sin avanzar.
   */
  async markPendingAsNotDone(
    sessionId: string,
    processId: number,
  ): Promise<number> {
    return this.updateItems(sessionId, processId, (item) =>
      this.isResolved(item) ? null : { ...item, ND: true, Modified: true },
    );
  }

  /**
   * Quita la marca N.D. conservando `Outcome`: al reanudar, las actividades
   * que quedaron sin dato vuelven a aparecer por completar.
   */
  async clearNotDone(sessionId: string, processId: number): Promise<number> {
    return this.updateItems(sessionId, processId, (item) =>
      item.ND === true ? { ...item, ND: false, Modified: true } : null,
    );
  }

  /**
   * Falla con 409 si queda alguna actividad sin resolver, para poder avisar
   * antes de intentar un avance que OpenMAINT rechazaría en silencio.
   */
  async assertComplete(sessionId: string, processId: number): Promise<void> {
    const card = await this.findCard(sessionId, processId);

    if (!card) {
      // Sin checklist asociado no hay nada que exigir
      return;
    }

    const pending = this.parseItems(card).filter(
      (item) => !this.isResolved(item),
    );

    if (pending.length === 0) {
      return;
    }

    throw new ConflictException(
      `Faltan ${pending.length} actividades del checklist por completar`,
    );
  }

  // ── Acceso a OpenMAINT ─────────────────────────────────────────────────────

  /**
   * Aplica una transformación a `Data` conservando las claves que la app no
   * interpreta. `transform` devuelve `null` para dejar el elemento intacto; si
   * ninguno cambia no se escribe nada.
   */
  private async updateItems(
    sessionId: string,
    processId: number,
    transform: (item: ChecklistRawItem) => ChecklistRawItem | null,
  ): Promise<number> {
    const card = await this.findCard(sessionId, processId);

    if (!card) {
      return 0;
    }

    let changed = 0;

    const merged = this.parseItems(card).map((item) => {
      const next = transform(item);

      if (!next) {
        return item;
      }

      changed += 1;

      return next;
    });

    if (changed === 0) {
      return 0;
    }

    try {
      await this.openmaint.updateChecklistCard(sessionId, card._id, merged);
    } catch (error) {
      this.logger.error(
        `No se pudo actualizar el checklist del mantenimiento ${processId}`,
        error,
      );

      throw new BadGatewayException(
        'Error al guardar el checklist en OpenMAINT',
      );
    }

    return changed;
  }

  private async findCard(
    sessionId: string,
    processId: number,
  ): Promise<ChecklistCard | undefined> {
    try {
      const response = await this.openmaint.findChecklistCard(
        sessionId,
        processId,
      );

      return response.data?.[0];
    } catch (error) {
      this.logger.error(
        `No se pudo consultar el checklist del mantenimiento ${processId}`,
        error,
      );

      throw new BadGatewayException(
        'Error al consultar el checklist en OpenMAINT',
      );
    }
  }

  private async requireCard(
    sessionId: string,
    processId: number,
  ): Promise<ChecklistCard> {
    const card = await this.findCard(sessionId, processId);

    if (!card) {
      throw new NotFoundException(
        'El mantenimiento preventivo no tiene un checklist asociado',
      );
    }

    return card;
  }

  // ── Mapeo ──────────────────────────────────────────────────────────────────

  private parseItems(card: ChecklistCard): ChecklistRawItem[] {
    if (!card.Data) {
      return [];
    }

    try {
      const parsed = JSON.parse(card.Data) as ChecklistRawItem[];

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      this.logger.error(
        `El campo Data del checklist ${card._id} no es un JSON válido`,
      );

      throw new BadGatewayException(
        'El checklist recibido de OpenMAINT tiene un formato inesperado',
      );
    }
  }

  private async toChecklistItems(
    sessionId: string,
    rawItems: ChecklistRawItem[],
  ): Promise<PreventiveChecklistItem[]> {
    const optionsByTaskDef = await this.resolveOptions(sessionId, rawItems);

    return [...rawItems]
      .sort((a, b) => (a.ExecOrder ?? 0) - (b.ExecOrder ?? 0))
      .map((item) => {
        const kind = CHECKLIST_FIELD_KINDS[item.Type] ?? 'text';

        return {
          order: item.ExecOrder,
          taskDefId: item.TaskDef,
          label: item._TaskDef_description ?? `Actividad ${item.ExecOrder}`,
          kind,
          value: item.Outcome ?? null,
          isResolved: this.isResolved(item),
          equipment: item._CI_description ?? null,
          ...(KINDS_WITH_OPTIONS.includes(kind)
            ? { options: optionsByTaskDef.get(item.TaskDef) ?? [] }
            : {}),
        };
      });
  }

  /**
   * Resuelve las opciones de los desplegables.
   *
   * `posneg` y `flag` comparten un lookup fijo, así que se consulta una sola
   * vez. Los de tipo `lookup` son configurables por actividad: hay que leer su
   * definición para saber qué lista usar, y las listas repetidas se consultan
   * una única vez.
   */
  private async resolveOptions(
    sessionId: string,
    rawItems: ChecklistRawItem[],
  ): Promise<Map<number, ChecklistOption[]>> {
    const result = new Map<number, ChecklistOption[]>();

    const needsFixed = rawItems.filter((item) =>
      this.hasFixedOptions(CHECKLIST_FIELD_KINDS[item.Type]),
    );

    const dynamicItems = rawItems.filter(
      (item) => CHECKLIST_FIELD_KINDS[item.Type] === 'lookup',
    );

    if (needsFixed.length > 0) {
      const values = await this.loadLookup(sessionId, PM_TASK_OUTCOME_LOOKUP);

      for (const item of needsFixed) {
        const kind = CHECKLIST_FIELD_KINDS[item.Type];
        const allowed = FIXED_OPTION_IDS_BY_KIND[kind] ?? [];

        // Se recorre `allowed` y no `values` para fijar el orden: el frontend
        // pinta la primera opción como la afirmativa
        result.set(
          item.TaskDef,
          allowed
            .map((id) => values.find((value) => value._id === id))
            .filter((value) => value !== undefined)
            .map((value) => this.toOption(value)),
        );
      }
    }

    // Cachea por nombre de lookup: varias actividades pueden compartir lista
    const lookupCache = new Map<string, ChecklistOption[]>();

    for (const item of dynamicItems) {
      const lookupName = await this.findLookupName(sessionId, item.TaskDef);

      if (!lookupName) {
        result.set(item.TaskDef, []);
        continue;
      }

      if (!lookupCache.has(lookupName)) {
        const values = await this.loadLookup(sessionId, lookupName);

        lookupCache.set(
          lookupName,
          values
            .filter((value) => value.active !== false)
            .map((value) => this.toOption(value)),
        );
      }

      result.set(item.TaskDef, lookupCache.get(lookupName) ?? []);
    }

    return result;
  }

  private async findLookupName(
    sessionId: string,
    taskDefId: number,
  ): Promise<string | undefined> {
    try {
      const response = await this.openmaint.findTaskDefinition(
        sessionId,
        taskDefId,
      );

      return response.data?._LookupType_description ?? undefined;
    } catch {
      // Sin definición no hay opciones, pero el resto del checklist es usable
      this.logger.warn(
        `No se pudo leer la definición de la actividad ${taskDefId}`,
      );

      return undefined;
    }
  }

  private async loadLookup(
    sessionId: string,
    lookupName: string,
  ): Promise<LookupValue[]> {
    try {
      const response = await this.openmaint.findLookupValues(
        sessionId,
        lookupName,
      );

      return response.data ?? [];
    } catch {
      this.logger.warn(`No se pudieron leer los valores de "${lookupName}"`);

      return [];
    }
  }

  private toOption(value: LookupValue): ChecklistOption {
    return toLookupOption(value);
  }

  private hasFixedOptions(kind: ChecklistFieldKind | undefined): boolean {
    return kind !== undefined && kind in FIXED_OPTION_IDS_BY_KIND;
  }

  /** Una actividad cuenta como resuelta si tiene valor o está marcada sin dato. */
  private isResolved(item: ChecklistRawItem): boolean {
    return item.ND === true || (item.Outcome !== null && item.Outcome !== '');
  }

  /** Los campos numéricos viajan como número; el resto, como string. */
  private toOutcome(type: number, value: string): string | number {
    const kind = CHECKLIST_FIELD_KINDS[type];

    if (kind === 'number') {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : value;
    }

    return value;
  }
}
