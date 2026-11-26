import type { HttpException } from '@nestjs/common';
import type {
  DownloadedFile,
  RawOpenmaintAttachment,
} from '../../../common/utils/openmaint-attachment.util';
import type { ResolvedCategory } from '../../../integrations/openmaint/maint-category-catalog.service';
import type {
  MaintenanceChecklist,
  MaintenanceEmployee,
  MaintenanceKind,
  MaintenancePlanFields,
  MaintenancePlanWarning,
  MaintenanceReadAttachment,
  MaintenanceReadDetail,
  MaintenanceReadFilters,
  MaintenanceReadItem,
} from '../maintenance-integration.types';

export type DetailExtras = {
  attachments: MaintenanceReadAttachment[];
  /** Solo lo usan los preventivos. */
  checklist: MaintenanceChecklist | null;
};

/** Lo que cambia entre correctivos y preventivos al leer. */
export interface MaintenanceFlow<
  TCard extends { _id: number } = { _id: number },
> {
  readonly kind: MaintenanceKind;
  /** Segmento de la ruta pública: `correctives` o `preventives`. */
  readonly path: 'correctives' | 'preventives';

  search(
    sessionId: string,
    filters: MaintenanceReadFilters,
  ): Promise<{ cards: TCard[]; total: number | null }>;
  fetch(sessionId: string, id: number): Promise<TCard | undefined>;
  attachments(sessionId: string, id: number): Promise<RawOpenmaintAttachment[]>;
  download(
    sessionId: string,
    id: number,
    attachmentId: string,
  ): Promise<DownloadedFile>;
  toItem(card: TCard): MaintenanceReadItem;
  toDetail(card: TCard, extras: DetailExtras): MaintenanceReadDetail;
}

type StepBase = {
  /** Qué hace; es la nota de auditoría si el cliente no mandó notas. */
  description: string;
  /** Estado público en que debe quedar la orden tras el paso (cualquiera de la lista). */
  expectStatus: string | string[];
  /** Atributos que la tarjeta debe reflejar tras el paso. */
  expectFields: Record<string, unknown>;
  /** Atributos que la fuente puede descartar: si no quedan, aviso `field_not_saved`. */
  softFields?: Record<string, unknown>;
  /** Si falla tras un paso aplicado: error 502 con este mensaje en vez del original. */
  failMessage?: string;
  /** Si no se puede confirmar este paso: 502 con este mensaje en vez del genérico. */
  unconfirmedMessage?: string;
  /** Es la cancelación: hay que avisar al técnico que la tenía. */
  cancels?: boolean;
  /** Si este paso falla tras uno aplicado, el cambio cuenta como aplicado con este aviso. */
  warnIfFails?: MaintenancePlanWarning;
  /** Como `warnIfFails`, pero cuando no se pudo releer para comprobarlo. */
  warnIfUnconfirmed?: MaintenancePlanWarning;
  /** Tras aplicarlo hay que avisar al técnico de la asignación. */
  assigns?: boolean;
};

export type FlowStep =
  | (StepBase & {
      type: 'advance';
      action: number;
      fields: Record<string, unknown>;
    })
  | (StepBase & { type: 'save'; fields: Record<string, unknown> })
  | (StepBase & { type: 'restoreExecStart'; value: string | null });

/** Sin pasos = no hay nada que escribir. */
export type FlowPlan = {
  steps: FlowStep[];
  warnings: MaintenancePlanWarning[];
};

export type FlowOutcome = FlowPlan | { error: HttpException };

/** Datos ya leídos que `prepare` necesita; ella nunca llama a la fuente. */
export type PrepareContext = {
  employees: MaintenanceEmployee[];
  teamIds: number[];
  /** Si el técnico actual no está en `employees`: lo que dice su ficha, leída aparte. */
  currentIsSupplier?: boolean;
  /** Categoría ya validada, solo si `categoryToResolve` la pidió. */
  category?: ResolvedCategory;
};

/** Lo que cada tipo de orden aporta para escribir. */
export interface MaintenanceWriteFlow<
  TCard extends { _id: number } = { _id: number },
> extends MaintenanceFlow<TCard> {
  /** Con la actividad activa, necesaria para avanzar o guardar. */
  fetchForWrite(sessionId: string, id: number): Promise<TCard | undefined>;
  statusOf(card: TCard): string | null;
  /** Si `prepare` necesita la lista de técnicos; por defecto, cuando el cambio nombra a uno. */
  needsEmployees?(card: TCard, fields: MaintenancePlanFields): boolean;
  /** Categoría y subcategoría que `prepare` necesita validadas, si aplica. */
  categoryToResolve?(
    card: TCard,
    fields: MaintenancePlanFields,
  ): { categoryId: number; subcategoryId: number } | null;
  prepare(
    card: TCard,
    fields: MaintenancePlanFields,
    context: PrepareContext,
  ): FlowOutcome;
  cancelSteps(card: TCard, reason: string): FlowOutcome;
  /** `card` debe traer la actividad activa; `note` solo la usan los avances. */
  execute(
    sessionId: string,
    card: TCard,
    step: FlowStep,
    note: string,
  ): Promise<void>;
}
