import { BadRequestException, ConflictException } from '@nestjs/common';
import { PM_ACTIONS } from '../../preventive-maintenance/constants/preventive-maint.constants';
import type { MaintenanceEmployee } from '../maintenance-integration.types';
import type { FlowOutcome, PrepareContext } from './maintenance-flow.types';
import { PreventiveFlow } from './preventive-flow';

const CODES: Record<string, string> = {
  Planning: 'PM-Opening',
  Acceptance: 'PM-Assignment',
  Execution: 'PM-Execution',
  Suspension: 'PM-Suspension',
  Completed: 'PM-Completed',
  Canceled: 'PM-Canceled',
};

const card = (status: string, over: Record<string, unknown> = {}) => ({
  _id: 10,
  _ProcessStatus_code: CODES[status],
  Assignee: null as number | null,
  ExpExecStartDate: null as string | null,
  _tasklist: [{ _id: 'act-1' }],
  ...over,
});

const employee = (id: number, isSupplier = false): MaintenanceEmployee => ({
  id,
  name: `E${id}`,
  team: { id: 501, name: null },
  isSupplier,
});

const CONTEXT: PrepareContext = {
  employees: [employee(7), employee(8), employee(9, true)],
  teamIds: [501],
};

const like = (value: object) => expect.objectContaining(value) as unknown;
const anyOf = (type: abstract new (...args: never[]) => unknown) =>
  expect.any(type) as unknown;

const START = '2026-11-26T15:00:00.000Z';
const OTHER = '2026-11-27T15:00:00.000Z';

describe('PreventiveFlow (escritura)', () => {
  const gateway = { advance: jest.fn(), saveFields: jest.fn() };
  const flow = new PreventiveFlow(gateway as never);

  const prepare = (c: ReturnType<typeof card>, fields: object) =>
    flow.prepare(c as never, fields, CONTEXT);
  const stepsOf = (outcome: FlowOutcome) => {
    if ('error' in outcome) throw outcome.error;
    return outcome;
  };

  beforeEach(() => jest.clearAllMocks());

  describe('tabla estado × campo', () => {
    it('Planning + técnico: avanza con ASSIGN y espera Acceptance', () => {
      const { steps, warnings } = stepsOf(
        prepare(card('Planning'), { employeeId: 7 }),
      );
      expect(warnings).toEqual([]);
      expect(steps).toEqual([
        like({
          type: 'advance',
          action: PM_ACTIONS.ASSIGN,
          fields: { Assignee: 7 },
          expectStatus: 'Acceptance',
          expectFields: { Assignee: 7 },
          assigns: true,
        }),
      ]);
    });

    it('Planning + técnico y fecha: tras asignar guarda la fecha, con aviso si falla', () => {
      const { steps } = stepsOf(
        prepare(card('Planning'), { employeeId: 7, plannedStartTime: START }),
      );
      expect(steps).toHaveLength(2);
      expect(steps[1]).toEqual(
        like({
          type: 'save',
          fields: { ExpExecStartDate: START },
          expectStatus: 'Acceptance',
          warnIfFails: 'planned_start_not_saved',
        }),
      );
    });

    it('Planning + fecha sin técnico: 409', () => {
      const outcome = prepare(card('Planning'), { plannedStartTime: START });
      expect(outcome).toEqual({ error: anyOf(ConflictException) });
      expect((outcome as { error: Error }).error.message).toBe(
        'La fecha se fija después de asignar',
      );
    });

    it('Acceptance: un solo guardado con técnico y fecha', () => {
      const { steps } = stepsOf(
        prepare(card('Acceptance', { Assignee: 8 }), {
          employeeId: 7,
          plannedStartTime: START,
        }),
      );
      expect(steps).toEqual([
        like({
          type: 'save',
          fields: { Assignee: 7, ExpExecStartDate: START },
          expectStatus: 'Acceptance',
        }),
      ]);
    });

    it('Acceptance: solo lo que cambia', () => {
      const { steps } = stepsOf(
        prepare(card('Acceptance', { Assignee: 7, ExpExecStartDate: START }), {
          employeeId: 7,
          plannedStartTime: OTHER,
        }),
      );
      expect(steps[0]).toEqual(like({ fields: { ExpExecStartDate: OTHER } }));
    });

    it('Execution: técnico por guardado, con aviso started', () => {
      const { steps, warnings } = stepsOf(
        prepare(card('Execution', { Assignee: 8 }), { employeeId: 7 }),
      );
      expect(warnings).toEqual(['started']);
      expect(steps).toEqual([
        like({
          type: 'save',
          fields: { Assignee: 7 },
          expectStatus: 'Execution',
        }),
      ]);
    });

    it('Execution y Suspension: la fecha es 409', () => {
      for (const status of ['Execution', 'Suspension']) {
        const outcome = prepare(card(status, { Assignee: 8 }), {
          plannedStartTime: START,
        });
        expect(outcome).toEqual({ error: anyOf(ConflictException) });
        const mixed = prepare(card(status, { Assignee: 8 }), {
          employeeId: 7,
          plannedStartTime: START,
        });
        expect(mixed).toEqual({ error: anyOf(ConflictException) });
      }
    });

    it('Suspension: técnico por CHANGE_ASSIGNEE y sigue en Suspension', () => {
      const { steps, warnings } = stepsOf(
        prepare(card('Suspension', { Assignee: 8 }), { employeeId: 7 }),
      );
      expect(warnings).toEqual(['started']);
      expect(steps).toEqual([
        like({
          type: 'advance',
          action: PM_ACTIONS.CHANGE_ASSIGNEE,
          fields: { Assignee: 7 },
          expectStatus: 'Suspension',
        }),
      ]);
    });

    it.each(['Completed', 'Canceled'])('%s: 409 con cambios', (status) => {
      expect(prepare(card(status, { Assignee: 8 }), { employeeId: 7 })).toEqual(
        {
          error: anyOf(ConflictException),
        },
      );
    });

    it.each(['Completed', 'Canceled'])(
      '%s: diff vacío es unchanged con aviso closed',
      (status) => {
        expect(
          prepare(card(status, { Assignee: 7 }), { employeeId: 7 }),
        ).toEqual({
          steps: [],
          warnings: ['closed'],
        });
      },
    );

    it.each(['Planning', 'Acceptance', 'Execution', 'Suspension'])(
      '%s: diff vacío no escribe',
      (status) => {
        const c = card(status, { Assignee: 7, ExpExecStartDate: START });
        const { steps } = stepsOf(
          prepare(c, {
            employeeId: 7,
            plannedStartTime: '2026-11-26T15:00:00.900Z',
            notes: 'solo nota',
          }),
        );
        expect(steps).toEqual([]);
      },
    );
  });

  describe('técnico', () => {
    it('proveedor como destino: 409', () => {
      expect(prepare(card('Planning'), { employeeId: 9 })).toEqual({
        error: anyOf(ConflictException),
      });
    });

    it('proveedor como origen: 409', () => {
      expect(
        prepare(card('Acceptance', { Assignee: 9 }), { employeeId: 7 }),
      ).toEqual({
        error: anyOf(ConflictException),
      });
    });

    it('inexistente o de otro equipo: 400', () => {
      expect(prepare(card('Planning'), { employeeId: 99 })).toEqual({
        error: anyOf(BadRequestException),
      });
    });

    it('una fecha inválida es 400', () => {
      expect(prepare(card('Acceptance'), { plannedStartTime: 'x' })).toEqual({
        error: anyOf(BadRequestException),
      });
    });
  });

  describe('cancelSteps', () => {
    it('Planning: PM01-Reject, espera Canceled y usa el motivo como descripción', () => {
      const { steps } = stepsOf(
        flow.cancelSteps(card('Planning') as never, 'Duplicado'),
      );
      expect(steps).toEqual([
        like({
          type: 'advance',
          action: PM_ACTIONS.CANCEL,
          description: 'Duplicado',
          expectStatus: 'Canceled',
        }),
      ]);
    });

    it('ya cancelado: sin pasos', () => {
      expect(flow.cancelSteps(card('Canceled') as never, 'x')).toEqual({
        steps: [],
        warnings: ['closed'],
      });
    });

    it.each(['Acceptance', 'Execution', 'Suspension', 'Completed'])(
      '%s: 409',
      (status) => {
        const outcome = flow.cancelSteps(card(status) as never, 'x');
        expect(outcome).toEqual({ error: anyOf(ConflictException) });
        expect((outcome as { error: Error }).error.message).toBe(
          'Solo se puede cancelar un preventivo en planificación',
        );
      },
    );
  });

  describe('execute', () => {
    it('avanza con la actividad de la tarjeta y la nota', async () => {
      const { steps } = stepsOf(prepare(card('Planning'), { employeeId: 7 }));
      await flow.execute('s', card('Planning') as never, steps[0], 'nota');
      expect(gateway.advance).toHaveBeenCalledWith('s', 10, {
        activityId: 'act-1',
        action: PM_ACTIONS.ASSIGN,
        notes: 'nota',
        fields: { Assignee: 7 },
      });
    });

    it('guarda sin nota', async () => {
      const { steps } = stepsOf(
        prepare(card('Execution', { Assignee: 8 }), { employeeId: 7 }),
      );
      await flow.execute('s', card('Execution') as never, steps[0], 'nota');
      expect(gateway.saveFields).toHaveBeenCalledWith('s', 10, {
        activityId: 'act-1',
        fields: { Assignee: 7 },
      });
    });

    it('sin actividad: 409', async () => {
      const { steps } = stepsOf(prepare(card('Planning'), { employeeId: 7 }));
      await expect(
        flow.execute(
          's',
          card('Planning', { _tasklist: [] }) as never,
          steps[0],
          'n',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(gateway.advance).not.toHaveBeenCalled();
    });
  });
});
