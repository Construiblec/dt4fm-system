import {
  PHASE_IDS,
  PHASE_NAMES,
  PhaseId,
} from '../../src/modules/cleaning-tasks/constants/phase.constants';
import type { CleaningTasksOpenmaintServiceMock } from '../mocks/gateways.mock';

export type StoredCleaning = Record<string, any> & { _id: number };

export const CLEANERS = [
  { _id: 7001, Description: 'Ana Ruiz' },
  { _id: 7002, Description: 'Beto Mora' },
  { _id: 7003, Description: 'Carla Paz' },
];

export const CHECKLISTS = [
  { id: 9100, code: 'EST', description: 'Checklist estudio' },
  { id: 9101, code: 'REP', description: 'Repaso rápido' },
  { id: 9200, code: 'SUPERVISION', description: 'Plantilla de supervisión' },
];

/** Error tal como lo devuelve la fuente; su texto nunca debe salir por la API. */
export const upstreamError = (status: number) =>
  Object.assign(
    new Error(`openMAINT respondió ${status} en http://openmaint.invalid`),
    { response: { status } },
  );

const phaseName = (phase: unknown): string =>
  PHASE_NAMES[Number(phase) as PhaseId] ?? String(phase);

// Sin repetir entre pruebas ni procesos: los servicios y las tablas recuerdan ids.
let nextId = Number(process.env.JEST_WORKER_ID ?? 1) * 1_000_000;

/** Fuente en memoria: lo que se escribe es lo que se lee después. */
export class CleaningStore {
  readonly cards = new Map<number, StoredCleaning>();

  put(id: number, overrides: Record<string, unknown> = {}): StoredCleaning {
    const card: StoredCleaning = {
      _id: id,
      _type: 'CleaningTask',
      TaskNumber: `CT.2026.${id}`,
      Description: `Limpieza - Suite ${id}`,
      phase: PHASE_IDS.ASSIGNED,
      GeneratedDate: '2026-11-25',
      CheckoutDate: '2026-11-26',
      HostawayReservation: null,
      HostawayListingID: null,
      PlannedStartTime: null,
      PlannedEndTime: null,
      ActualStartTime: null,
      ActualEndTime: null,
      Unit: null,
      Employee: null,
      CleaningChecklist: null,
      Observations: null,
      TeamObservations: null,
      Notes: null,
      ...overrides,
    };
    card._phase_description = phaseName(card.phase);
    this.cards.set(id, card);
    return card;
  }

  get(id: number): StoredCleaning {
    const card = this.cards.get(id);
    if (!card) throw new Error(`No hay limpieza ${id} en la fuente de prueba`);
    return card;
  }

  byReservation(reservationId: string): StoredCleaning[] {
    return [...this.cards.values()].filter(
      (card) => card.HostawayReservation === reservationId,
    );
  }

  attach(gateway: CleaningTasksOpenmaintServiceMock): void {
    const copy = (card: StoredCleaning) => structuredClone(card);
    const implement = (
      mock: jest.Mock,
      implementation: (...args: any[]) => unknown,
    ) =>
      mock
        .mockReset()
        .mockImplementation((...args: unknown[]) =>
          Promise.resolve().then(() => implementation(...args)),
        );

    implement(gateway.getTaskByIdWithSession, (id: number) => {
      const card = this.cards.get(id);
      if (!card) throw upstreamError(404);
      return { data: copy(card) };
    });
    implement(gateway.updateCleaningTask, (id: number, body: object) => {
      const card = Object.assign(this.get(id), body);
      card._phase_description = phaseName(card.phase);
      card._Employee_description =
        CLEANERS.find(({ _id }) => _id === card.Employee)?.Description ?? null;
      return { data: copy(card) };
    });
    implement(gateway.createCleaningTask, (body: Record<string, unknown>) => ({
      data: copy(this.put(nextId++, body)),
    }));
    implement(
      gateway.getAllTasks,
      ({ phase, assigned, checkoutDate, employeeId, limit, offset }: any) => {
        const all = [...this.cards.values()]
          .filter(
            (card) =>
              (!phase || card._phase_description === phase) &&
              (assigned === undefined ||
                (card.Employee !== null) === assigned) &&
              (!checkoutDate || card.CheckoutDate === checkoutDate) &&
              (!employeeId || card.Employee === employeeId),
          )
          .sort((a, b) => b._id - a._id);
        return {
          data: all.slice(offset, offset + limit).map(copy),
          meta: { total: all.length },
        };
      },
    );
    implement(gateway.findTasksByReservation, (id: string) =>
      this.byReservation(id).map(copy),
    );
    implement(
      gateway.taskExistsByReservationId,
      (id: string) => this.byReservation(id).length > 0,
    );
    implement(gateway.findHostawayTasksByCheckout, (day: string) =>
      [...this.cards.values()]
        .filter((card) => card.HostawayReservation && card.CheckoutDate === day)
        .map(copy),
    );
    implement(gateway.listEmployees, () => ({ data: CLEANERS }));
    implement(gateway.listChecklistOptions, () => CHECKLISTS);
    implement(gateway.listUnitsWithListingOrThrow, () => []);
    implement(gateway.getUnitByIdWithSession, (id: number) => {
      if (id >= 400) throw upstreamError(404);
      return { data: { _id: id, Code: `R${id}`, Description: `R${id}` } };
    });
    implement(gateway.getUnitById, (id: number) => ({
      data: {
        _id: id,
        Code: `R${id}`,
        Description: `R${id}`,
        Name: `Estudio ${id}`,
        Building: 3019998,
        _Building_description: 'Pradera',
      },
    }));
  }
}
