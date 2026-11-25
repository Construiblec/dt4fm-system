import type { CleaningReadItem } from './cleaning-read.types';

/** `undefined` = sin cambio; `null` = borrar. */
export type CleaningPlanFields = {
  employeeId?: number | null;
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  checklistId?: number | null;
  unitId?: number | null;
  observations?: string | null;
  checkoutDate?: string;
  description?: string;
};

export type CleaningPlanChange = { id: number } & CleaningPlanFields;

/** Lo que cuenta para avisar a un operario. `cancelled` deja la limpieza sin dueño. */
export type CleaningPlanSnapshot = {
  employeeId: number | null;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
  cancelled?: boolean;
};

export type CleaningOverlap = {
  id: number;
  description: string | null;
  phase: string;
  plannedStartTime: string | null;
  plannedEndTime: string | null;
};

export type CleaningPlanWarning =
  | { code: 'overlap'; cleanings: CleaningOverlap[] }
  /** Asignada sin inicio y fin planeados: no se pueden comprobar cruces. */
  | { code: 'no_schedule' }
  /** Ya empezó (en ejecución, en pausa o reabierta). */
  | { code: 'started' }
  /** Terminada, revisada o cancelada. */
  | { code: 'closed' };

export type CleaningPlanResult = {
  id: number;
  result: 'applied' | 'unchanged';
  warnings: CleaningPlanWarning[];
  /** `null`: se guardó, pero no se pudo releer. */
  data: CleaningReadItem | null;
};

export type CleaningBatchResult = {
  id: number;
  /** `valid` solo con `dryRun`; `not_attempted` = se agotó el plazo del lote. */
  result: 'applied' | 'unchanged' | 'valid' | 'failed' | 'not_attempted';
  warnings: CleaningPlanWarning[];
  error: { statusCode: number; message: string } | null;
};

export type CleanerCleaning = CleaningOverlap & {
  isPaused: boolean;
  actualStartTime: string | null;
  checkoutDate: string | null;
  unitId: number | null;
};

export type CleanerAgenda = {
  id: number;
  name: string;
  /** Limpieza que está ejecutando ahora mismo. */
  inExecutionId: number | null;
  /** Suma de lo planeado dentro del rango. */
  plannedMinutes: number;
  /** Abiertas con horario que cae en el rango, más la que esté en ejecución. */
  cleanings: CleanerCleaning[];
  /** Abiertas y asignadas sin horario completo, de cualquier fecha. */
  unscheduled: CleanerCleaning[];
};

export type CleaningChecklistOption = {
  id: number;
  code: string | null;
  description: string | null;
};

/** `actor` es el nombre del cliente de la API, solo para el registro. */
export interface CleaningPlanningContract {
  update(
    id: number,
    fields: CleaningPlanFields,
    actor: string,
  ): Promise<CleaningPlanResult>;
  cancel(
    id: number,
    reason: string,
    actor: string,
  ): Promise<CleaningPlanResult>;
  batch(
    changes: CleaningPlanChange[],
    options: { dryRun: boolean; actor: string },
  ): Promise<CleaningBatchResult[]>;
  /** Instantes ISO, rango [from, to). */
  listCleaners(from: string, to: string): Promise<CleanerAgenda[]>;
  listChecklists(): Promise<CleaningChecklistOption[]>;
}
