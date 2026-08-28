import {
  PHASE_IDS,
  PHASE_NAMES,
  PhaseId,
} from '../../src/modules/cleaning-tasks/constants/phase.constants';

export interface CleaningTaskCardOptions {
  id?: number;
  phase: PhaseId;
  employee?: number | null;
  actualStartTime?: string | null;
  plannedStartTime?: string | null;
  executionTime?: number | null;
  delayTime?: number | null;
  teamObservations?: string | null;
  supervisionObserv?: string | null;
  unit?: number | null;
  checklist?: boolean;
}

export const cleaningTaskCard = (opts: CleaningTaskCardOptions) => ({
  _id: opts.id ?? 777,
  _phase_description: PHASE_NAMES[opts.phase],
  phase: PHASE_NAMES[opts.phase],
  Employee: opts.employee ?? null,
  ActualStartTime: opts.actualStartTime ?? null,
  PlannedStartTime: opts.plannedStartTime ?? '2026-08-27T09:00:00Z',
  ExecutionTime: opts.executionTime ?? null,
  DelayTime: opts.delayTime ?? null,
  TeamObservations: opts.teamObservations ?? null,
  SupervisionObserv: opts.supervisionObserv ?? null,
  Unit: opts.unit ?? null,
  CleaningChecklist: opts.checklist ?? false,
  HostawayReservationId: 'R-4857692',
  ListingName: 'Suite mock',
  CheckoutDate: '2026-08-27',
  CheckoutTime: '11:00',
});

export const cleaningTaskResponse = (opts: CleaningTaskCardOptions) => ({
  data: cleaningTaskCard(opts),
});

export { PHASE_IDS };
