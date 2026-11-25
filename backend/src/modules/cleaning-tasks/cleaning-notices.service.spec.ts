import { Logger } from '@nestjs/common';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import { CleaningNoticesService } from './cleaning-notices.service';
import type { CleaningPlanSnapshot } from './cleaning-planning.types';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';

const A = 1;
const B = 2;
const C = 3;

const START = '2026-11-25T10:00:00Z';
const END = '2026-11-25T12:00:00Z';
const LATER = '2026-11-25T15:00:00Z';

const plan = (
  employeeId: number | null,
  extra: Partial<CleaningPlanSnapshot> = {},
): CleaningPlanSnapshot => ({
  employeeId,
  plannedStartTime: START,
  plannedEndTime: END,
  ...extra,
});

const counts = (extra: object) => ({
  assigned: 0,
  rescheduled: 0,
  removed: 0,
  cancelled: 0,
  ...extra,
});

describe('CleaningNoticesService', () => {
  const push = {
    notifyCleaningAssigned: jest.fn(),
    notifyCleaningPlanUpdated: jest.fn(),
  };
  const openmaint = {
    getTaskByIdWithSession: jest.fn(),
    getUnitById: jest.fn(),
  };
  let service: CleaningNoticesService;
  let warn: jest.SpyInstance;

  /** Resúmenes enviados: operario → conteos. */
  const summaries = () =>
    new Map(
      push.notifyCleaningPlanUpdated.mock.calls.map(
        ([input]: [{ cleaningEmployeeId: number; counts: object }]) => [
          input.cleaningEmployeeId,
          input.counts,
        ],
      ),
    );

  beforeEach(() => {
    jest.useFakeTimers();
    push.notifyCleaningAssigned.mockReset().mockResolvedValue(undefined);
    push.notifyCleaningPlanUpdated.mockReset().mockResolvedValue(undefined);
    // Por defecto no hay ubicación: todo sale como resumen.
    openmaint.getTaskByIdWithSession.mockReset().mockResolvedValue(null);
    openmaint.getUnitById.mockReset().mockResolvedValue(null);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    service = new CleaningNoticesService(
      push as unknown as PushDispatchService,
      openmaint as unknown as CleaningTasksOpenmaintService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    warn.mockRestore();
  });

  describe('neto', () => {
    it.each<
      [
        string,
        CleaningPlanSnapshot,
        CleaningPlanSnapshot,
        Record<number, object>,
      ]
    >([
      ['sin operario → A', plan(null), plan(A), { [A]: { assigned: 1 } }],
      ['A → sin operario', plan(A), plan(null), { [A]: { removed: 1 } }],
      [
        'A → B',
        plan(A),
        plan(B),
        { [A]: { removed: 1 }, [B]: { assigned: 1 } },
      ],
      [
        'A → B con otro horario: solo cambia de dueño',
        plan(A),
        plan(B, { plannedStartTime: LATER }),
        { [A]: { removed: 1 }, [B]: { assigned: 1 } },
      ],
      [
        'mismo operario, otro fin',
        plan(A),
        plan(A, { plannedEndTime: LATER }),
        { [A]: { rescheduled: 1 } },
      ],
      [
        'mismo operario, horario borrado',
        plan(A),
        plan(A, { plannedStartTime: null }),
        { [A]: { rescheduled: 1 } },
      ],
      [
        'mismo instante escrito distinto',
        plan(A),
        plan(A, { plannedStartTime: '2026-11-25T05:00:00.000-05:00' }),
        {},
      ],
      [
        'sin operario, otro horario',
        plan(null),
        plan(null, { plannedStartTime: LATER }),
        {},
      ],
      [
        'cancelada',
        plan(A),
        plan(A, { cancelled: true }),
        { [A]: { cancelled: 1 } },
      ],
      [
        'cancelada y sin dueño después',
        plan(A),
        plan(null, { cancelled: true }),
        { [A]: { cancelled: 1 } },
      ],
      [
        'cancelada sin operario',
        plan(null),
        plan(null, { cancelled: true }),
        {},
      ],
      [
        'ya estaba cancelada',
        plan(A, { cancelled: true }),
        plan(A, { cancelled: true }),
        {},
      ],
    ])('%s', async (_name, before, after, expected) => {
      service.record(10, before, after);
      await service.flush();

      expect(summaries()).toEqual(
        new Map(
          Object.entries(expected).map(([id, value]) => [
            Number(id),
            counts(value),
          ]),
        ),
      );
    });

    it('A→B→A no avisa a nadie', async () => {
      service.record(10, plan(A), plan(B));
      service.record(10, plan(B), plan(A));
      await service.flush();

      expect(summaries().size).toBe(0);
    });

    it('A→B→C retira a A y asigna a C; B no se entera', async () => {
      service.record(10, plan(A), plan(B));
      service.record(10, plan(B), plan(C));
      await service.flush();

      expect(summaries()).toEqual(
        new Map([
          [A, counts({ removed: 1 })],
          [C, counts({ assigned: 1 })],
        ]),
      );
    });

    it('A→B→cancelada solo avisa a A', async () => {
      service.record(10, plan(A), plan(B));
      service.record(10, plan(B), plan(B, { cancelled: true }));
      await service.flush();

      expect(summaries()).toEqual(new Map([[A, counts({ cancelled: 1 })]]));
    });

    it('reprogramada y devuelta a su horario no avisa', async () => {
      service.record(10, plan(A), plan(A, { plannedStartTime: LATER }));
      service.record(10, plan(A, { plannedStartTime: LATER }), plan(A));
      await service.flush();

      expect(summaries().size).toBe(0);
    });
  });

  describe('agrupación', () => {
    it('10 cambios al mismo operario salen en un push', async () => {
      for (let id = 1; id <= 10; id += 1) {
        service.record(id, plan(null), plan(A));
      }
      await service.flush();

      expect(push.notifyCleaningPlanUpdated).toHaveBeenCalledTimes(1);
      expect(summaries()).toEqual(new Map([[A, counts({ assigned: 10 })]]));
      expect(push.notifyCleaningAssigned).not.toHaveBeenCalled();
    });

    it('mezcla de cambios en un solo resumen', async () => {
      service.record(1, plan(null), plan(A));
      service.record(2, plan(A), plan(A, { plannedEndTime: LATER }));
      service.record(3, plan(A), plan(null));
      service.record(4, plan(A), plan(A, { cancelled: true }));
      await service.flush();

      expect(summaries()).toEqual(
        new Map([
          [A, { assigned: 1, rescheduled: 1, removed: 1, cancelled: 1 }],
        ]),
      );
    });
  });

  describe('una sola asignación', () => {
    it('usa el aviso de siempre con la ubicación', async () => {
      openmaint.getTaskByIdWithSession.mockResolvedValue({
        data: {
          _id: 10,
          Employee: A,
          Unit: 5,
          _Unit_description: 'R315 - Estudio 15',
        },
      });
      openmaint.getUnitById.mockResolvedValue({
        data: { _id: 5, _Building_description: 'R - República' },
      });

      service.record(10, plan(null), plan(A));
      await service.flush();

      expect(push.notifyCleaningAssigned).toHaveBeenCalledWith({
        id: 10,
        cleaningEmployeeId: A,
        unitName: 'R315 - Estudio 15',
        buildingName: 'R - República',
      });
      expect(push.notifyCleaningPlanUpdated).not.toHaveBeenCalled();
    });

    it('sin la unidad se queda con el nombre de la tarjeta', async () => {
      openmaint.getTaskByIdWithSession.mockResolvedValue({
        data: { _id: 10, Employee: A, Unit: 5, _Unit_description: 'R315' },
      });
      openmaint.getUnitById.mockRejectedValue(new Error('caído'));

      service.record(10, plan(null), plan(A));
      await service.flush();

      expect(push.notifyCleaningAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, unitName: 'R315' }),
      );
    });

    it('si entre medias pasó a otro operario, no avisa', async () => {
      openmaint.getTaskByIdWithSession.mockResolvedValue({
        data: { _id: 10, Employee: B },
      });

      service.record(10, plan(null), plan(A));
      await service.flush();

      expect(push.notifyCleaningAssigned).not.toHaveBeenCalled();
      expect(push.notifyCleaningPlanUpdated).not.toHaveBeenCalled();
    });

    it('si la limpieza no se puede leer, usa el resumen', async () => {
      openmaint.getTaskByIdWithSession.mockRejectedValue(new Error('caído'));

      service.record(10, plan(null), plan(A));
      await service.flush();

      expect(push.notifyCleaningAssigned).not.toHaveBeenCalled();
      expect(summaries()).toEqual(new Map([[A, counts({ assigned: 1 })]]));
    });

    it('una lectura colgada no retiene el aviso', async () => {
      openmaint.getTaskByIdWithSession.mockReturnValue(new Promise(() => {}));

      service.record(10, plan(null), plan(A));
      const flushed = service.flush();
      await jest.advanceTimersByTimeAsync(5_000);
      await flushed;

      expect(summaries()).toEqual(new Map([[A, counts({ assigned: 1 })]]));
    });
  });

  describe('temporizador', () => {
    it('espera 60 s desde el último cambio', async () => {
      service.record(1, plan(null), plan(A));
      await jest.advanceTimersByTimeAsync(50_000);
      service.record(2, plan(null), plan(A));
      await jest.advanceTimersByTimeAsync(59_000);
      expect(push.notifyCleaningPlanUpdated).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1_000);
      expect(summaries()).toEqual(new Map([[A, counts({ assigned: 2 })]]));
    });

    it('no pasa de 5 min desde el primero y abre otra ventana después', async () => {
      // Un cambio cada 30 s: nunca hay 60 s de calma.
      for (let i = 0; i < 10; i += 1) {
        service.record(i + 1, plan(null), plan(A));
        await jest.advanceTimersByTimeAsync(29_999);
      }
      expect(push.notifyCleaningPlanUpdated).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(10);
      expect(summaries()).toEqual(new Map([[A, counts({ assigned: 10 })]]));

      service.record(50, plan(B), plan(null));
      await jest.advanceTimersByTimeAsync(59_999);
      expect(push.notifyCleaningPlanUpdated).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(push.notifyCleaningPlanUpdated).toHaveBeenCalledTimes(2);
    });

    it('un cambio sin interés no alarga la ventana', async () => {
      service.record(1, plan(A), plan(null));
      await jest.advanceTimersByTimeAsync(50_000);
      service.record(2, plan(A), plan(A));
      await jest.advanceTimersByTimeAsync(10_000);

      expect(push.notifyCleaningPlanUpdated).toHaveBeenCalledTimes(1);
    });

    it('con 500 limpiezas pendientes envía de inmediato', async () => {
      for (let id = 1; id <= 500; id += 1) {
        service.record(id, plan(null), plan(A));
      }
      await jest.advanceTimersByTimeAsync(0);

      expect(summaries()).toEqual(new Map([[A, counts({ assigned: 500 })]]));
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('robustez', () => {
    it('dos flush a la vez envían una sola vez y ambos esperan', async () => {
      let release: () => void = () => {};
      push.notifyCleaningPlanUpdated.mockReturnValue(
        new Promise<void>((resolve) => (release = resolve)),
      );
      service.record(10, plan(A), plan(null));

      let secondDone = false;
      const first = service.flush();
      const second = service.flush().then(() => (secondDone = true));
      await jest.advanceTimersByTimeAsync(0);
      expect(secondDone).toBe(false);

      release();
      await Promise.all([first, second]);
      expect(push.notifyCleaningPlanUpdated).toHaveBeenCalledTimes(1);
    });

    it('lo que llega durante un envío queda para el siguiente', async () => {
      service.record(10, plan(A), plan(null));
      const first = service.flush();
      service.record(10, plan(null), plan(B));
      await first;
      expect(summaries()).toEqual(new Map([[A, counts({ removed: 1 })]]));

      await service.flush();
      expect(summaries().get(B)).toEqual(counts({ assigned: 1 }));
    });

    it('un push que falla no lanza ni impide los demás', async () => {
      push.notifyCleaningPlanUpdated.mockRejectedValueOnce(new Error('caído'));
      service.record(10, plan(A), plan(null));
      service.record(11, plan(B), plan(null));

      await expect(service.flush()).resolves.toBeUndefined();
      expect(summaries().size).toBe(2);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('record no lanza ni con datos inválidos', () => {
      expect(() =>
        service.record(10, null as never, undefined as never),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('sin nada pendiente no envía', async () => {
      await service.flush();
      expect(push.notifyCleaningPlanUpdated).not.toHaveBeenCalled();
    });
  });

  describe('cierre', () => {
    it.each(['onModuleDestroy', 'onApplicationShutdown'] as const)(
      '%s envía lo pendiente y no deja temporizadores',
      async (hook) => {
        service.record(10, plan(A), plan(null));
        await service[hook]();

        expect(push.notifyCleaningPlanUpdated).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
      },
    );

    it('espera como mucho 10 s', async () => {
      push.notifyCleaningPlanUpdated.mockReturnValue(new Promise(() => {}));
      service.record(10, plan(A), plan(null));

      let closed = false;
      const closing = service.onModuleDestroy().then(() => (closed = true));
      await jest.advanceTimersByTimeAsync(9_999);
      expect(closed).toBe(false);

      await jest.advanceTimersByTimeAsync(1);
      await closing;
      expect(closed).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
