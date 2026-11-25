import { Logger } from '@nestjs/common';
import { CleaningSyncService } from './cleaning-sync.service';
import { PHASE_IDS } from './constants/phase.constants';

// 10:00 en Guayaquil.
const NOW = new Date('2026-11-25T15:00:00Z');
const TODAY = '2026-11-25';
const TOMORROW = '2026-11-26';
const REASON = 'Reserva cancelada en Hostaway';

const task = (over: object = {}) => ({
  _id: 100,
  _phase_description: 'Assigned',
  phase: PHASE_IDS.ASSIGNED,
  HostawayReservation: 'R1',
  HostawayListingID: 'L1',
  CheckoutDate: TODAY,
  Description: 'Limpieza - Apto 1',
  ...over,
});
const cancelledTask = (over: object = {}) =>
  task({
    _phase_description: 'Cancelled',
    phase: PHASE_IDS.CANCELLED,
    ...over,
  });

const row = (over: object = {}) => ({
  reservationId: 'R1',
  guestName: 'Huésped',
  listingName: 'Apto 1',
  listingId: 'L1',
  checkoutDate: TODAY,
  checkoutTime: 11,
  ...over,
});

const state = (over: object = {}) => ({
  kind: 'found',
  status: 'modified',
  checkoutDate: TODAY,
  checkoutTime: 11,
  listingId: 'L1',
  listingName: 'Apto 1',
  guestName: 'Huésped',
  ...over,
});

type Card = ReturnType<typeof task>;

type BaselineRow = { taskId: string; checkoutDate: string; listingId: string };

const setup = (env: Record<string, string> = {}) => {
  /** Marcas confirmadas; las provisionales van aparte. */
  const marks = new Set<string>();
  const provisional = new Set<string>();
  const bases = new Map<string, BaselineRow>();
  const order: string[] = [];
  const hostaway = {
    getCheckouts: jest.fn().mockResolvedValue({ result: [], count: 0 }),
    getReservationState: jest.fn().mockResolvedValue({ kind: 'not_found' }),
  };
  const cleaningTasks = {
    createCleaningTask: jest
      .fn()
      .mockResolvedValue({ created: true, taskId: 900 }),
  };
  const gateway = {
    findHostawayTasksByCheckout: jest.fn().mockResolvedValue([]),
    findTasksByReservation: jest.fn().mockResolvedValue([]),
    listUnitsWithListingOrThrow: jest.fn().mockResolvedValue([]),
    getTaskByIdWithSession: jest.fn().mockResolvedValue({ data: undefined }),
    updateCleaningTask: jest.fn().mockImplementation(() => {
      order.push('write');
      return Promise.resolve({ data: {} });
    }),
  };
  const session = { isCoolingDown: jest.fn().mockReturnValue(false) };
  const supervisions = { cancelOpenForTask: jest.fn().mockResolvedValue([]) };
  const notices = { record: jest.fn() };
  const cancellations = {
    upsert: jest.fn().mockImplementation((value: { taskId: string }) => {
      order.push('mark');
      marks.delete(value.taskId);
      provisional.add(value.taskId);
      return Promise.resolve();
    }),
    update: jest.fn().mockImplementation((value: { taskId: string }) => {
      if (provisional.delete(value.taskId)) marks.add(value.taskId);
      return Promise.resolve();
    }),
    delete: jest.fn().mockImplementation((value: { taskId: string }) => {
      marks.delete(value.taskId);
      provisional.delete(value.taskId);
      return Promise.resolve();
    }),
    find: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve([...marks].map((taskId) => ({ taskId }))),
      ),
  };
  const baselineRows = {
    find: jest
      .fn()
      .mockImplementation(() => Promise.resolve([...bases.values()])),
    upsert: jest.fn().mockImplementation((rows: BaselineRow[]) => {
      for (const entry of rows) bases.set(entry.taskId, entry);
      return Promise.resolve();
    }),
  };
  /** Lo último que Hostaway había dicho de la limpieza. */
  const base = (taskId = 100, checkoutDate = TODAY, listingId = 'L1') =>
    bases.set(String(taskId), {
      taskId: String(taskId),
      checkoutDate,
      listingId,
    });
  const values: Record<string, string> = {
    HOSTAWAY_SCHEDULER_ENABLED: 'true',
    ...env,
  };
  const service = new CleaningSyncService(
    hostaway as never,
    cleaningTasks as never,
    gateway as never,
    session as never,
    supervisions as never,
    notices as never,
    { get: (key: string) => values[key] } as never,
    cancellations as never,
    baselineRows as never,
  );

  /** Deja una única limpieza en la fuente, vista igual por todas las lecturas. */
  const stored = (...cards: Card[]) => {
    gateway.findTasksByReservation.mockResolvedValue(cards);
    gateway.findHostawayTasksByCheckout.mockImplementation((day: string) =>
      Promise.resolve(cards.filter((c) => c.CheckoutDate === day)),
    );
    gateway.getTaskByIdWithSession.mockImplementation((id: number) =>
      Promise.resolve({ data: cards.find((c) => c._id === id) }),
    );
  };

  return {
    service,
    hostaway,
    cleaningTasks,
    gateway,
    session,
    supervisions,
    notices,
    cancellations,
    marks,
    provisional,
    bases,
    base,
    baselineRows,
    order,
    stored,
  };
};

describe('CleaningSyncService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('ventana', () => {
    it('hoy y mañana por defecto', async () => {
      const t = setup();
      await t.service.reconcileWindow();
      expect(t.hostaway.getCheckouts).toHaveBeenCalledWith(TODAY, TOMORROW);
    });

    it.each([
      ['2026-11-26T00:30:00Z', '2026-11-25', '2026-11-26'],
      ['2026-11-26T04:59:00Z', '2026-11-25', '2026-11-26'],
      ['2026-12-31T23:30:00Z', '2026-12-31', '2027-01-01'],
    ])('a las %s «hoy» es el día de Guayaquil', async (now, from, to) => {
      jest.setSystemTime(new Date(now));
      const t = setup();
      await t.service.reconcileWindow();
      expect(t.hostaway.getCheckouts).toHaveBeenCalledWith(from, to);
    });

    it.each([
      ['1', 1],
      ['14', 14],
      ['0', 2],
      ['15', 2],
      ['2.5', 2],
      ['x', 2],
      ['', 2],
    ])('HOSTAWAY_SYNC_DAYS=%s → %s', (raw, days) => {
      expect(
        setup({ HOSTAWAY_SYNC_DAYS: raw }).service.status().windowDays,
      ).toBe(days);
    });
  });

  describe('creación', () => {
    it('crea la limpieza de un checkout que no la tiene', async () => {
      const t = setup();
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row()] });

      const result = await t.service.reconcileWindow();

      expect(result).toMatchObject({ created: 1, failed: 0 });
      expect(t.cleaningTasks.createCleaningTask).toHaveBeenCalledWith(
        {
          hostawayReservationId: 'R1',
          listingName: 'Apto 1',
          listingId: 'L1',
          checkoutDate: TODAY,
          checkoutTime: '11:00',
          guestName: 'Huésped',
        },
        [],
      );
    });

    it('si falla la búsqueda de existentes no crea y cuenta el fallo; las demás siguen', async () => {
      const t = setup();
      t.hostaway.getCheckouts.mockResolvedValue({
        result: [row(), row({ reservationId: 'R2' })],
      });
      t.gateway.findTasksByReservation.mockImplementation((id: string) =>
        id === 'R1' ? Promise.reject(new Error('caído')) : Promise.resolve([]),
      );

      const result = await t.service.reconcileWindow();

      expect(result).toMatchObject({ created: 1, failed: 1 });
      expect(t.cleaningTasks.createCleaningTask).toHaveBeenCalledTimes(1);
      expect(t.service.status().lastSuccessAt).toBeNull();
    });

    it('si falla el listado de la ventana no toca nada', async () => {
      const t = setup();
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row()] });
      t.gateway.findHostawayTasksByCheckout.mockRejectedValue(
        new Error('caído'),
      );

      await expect(t.service.reconcileWindow()).rejects.toThrow('caído');
      expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
      expect(t.service.status()).toMatchObject({
        lastSuccessAt: null,
        lastResult: { failed: 1 },
      });
    });

    it('otra ya la creó → sin cambios', async () => {
      const t = setup();
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row()] });
      t.cleaningTasks.createCleaningTask.mockResolvedValue({ created: false });

      expect(await t.service.reconcileWindow()).toMatchObject({
        created: 0,
        unchanged: 1,
      });
    });

    it.each([
      { listingId: '' },
      { checkoutDate: 'mal' },
      { checkoutDate: '2026-02-31' },
      { reservationId: '' },
    ])('omite la fila inválida %j', async (over) => {
      const t = setup();
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row(over)] });

      expect(await t.service.reconcileWindow()).toMatchObject({ skipped: 1 });
      expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
    });

    it('con datos de hace más de un minuto vuelve a preguntar antes de crear', async () => {
      const t = setup();
      t.hostaway.getCheckouts.mockResolvedValue({
        result: [row(), row({ reservationId: 'R2' })],
      });
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );
      t.cleaningTasks.createCleaningTask.mockImplementationOnce(() => {
        jest.setSystemTime(new Date(NOW.getTime() + 60_001));
        return Promise.resolve({ created: true, taskId: 900 });
      });

      expect(await t.service.reconcileWindow()).toMatchObject({
        created: 1,
        unchanged: 1,
      });
      expect(t.hostaway.getReservationState.mock.calls).toEqual([['R2']]);
      expect(t.cleaningTasks.createCleaningTask).toHaveBeenCalledTimes(1);
    });

    it('las altas van de una en una', async () => {
      const t = setup();
      t.hostaway.getReservationState.mockResolvedValue(state());
      let active = 0;
      let max = 0;
      t.cleaningTasks.createCleaningTask.mockImplementation(async () => {
        max = Math.max(max, ++active);
        await Promise.resolve();
        active--;
        return { created: true, taskId: 1 };
      });

      await Promise.all(
        ['R1', 'R2', 'R3'].map((id) => t.service.reconcileReservation(id)),
      );
      expect(t.cleaningTasks.createCleaningTask).toHaveBeenCalledTimes(3);
      expect(max).toBe(1);
    });

    it.each(['2026-11-24', '2026-11-27'])(
      'una reserva con salida %s no se crea por señal',
      async (checkoutDate) => {
        const t = setup();
        t.hostaway.getReservationState.mockResolvedValue(
          state({ checkoutDate }),
        );
        expect(await t.service.reconcileReservation('R1')).toBe('skipped');
        expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
      },
    );
  });

  describe('cancelación', () => {
    it('cancela la que no empezó: marca, escribe, avisa y cierra supervisiones', async () => {
      const t = setup();
      t.stored(task({ Employee: 7, PlannedStartTime: '2026-11-25T17:00:00Z' }));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      const result = await t.service.reconcileWindow();

      expect(result).toMatchObject({ cancelled: 1, failed: 0 });
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(100, {
        phase: PHASE_IDS.CANCELLED,
        Notes: REASON,
      });
      expect(t.order).toEqual(['mark', 'write']);
      expect(t.marks.has('100')).toBe(true);
      expect(t.supervisions.cancelOpenForTask).toHaveBeenCalledWith(100);
      const before = {
        employeeId: 7,
        plannedStartTime: '2026-11-25T17:00:00Z',
        plannedEndTime: null,
      };
      expect(t.notices.record).toHaveBeenCalledWith(100, before, {
        ...before,
        cancelled: true,
      });
    });

    it('una lista vacía de checkouts no cancela nada por sí misma', async () => {
      const t = setup();
      t.stored(task());
      t.hostaway.getReservationState.mockResolvedValue(state());

      expect(await t.service.reconcileWindow()).toMatchObject({ unchanged: 1 });
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it('si Hostaway falla no cancela', async () => {
      const t = setup();
      t.stored(task());
      t.hostaway.getReservationState.mockRejectedValue(new Error('503'));

      expect(await t.service.reconcileWindow()).toMatchObject({
        cancelled: 0,
        failed: 1,
      });
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
      expect(t.marks.size).toBe(0);
    });

    it.each([
      state({ status: 'pending', checkoutDate: TOMORROW }),
      state({ status: 'ownerstay', checkoutDate: TOMORROW }),
      state({ status: 'inquiry' }),
      state({ status: '' }),
      { kind: 'not_found' },
    ])('no toca nada con %j', async (value) => {
      const t = setup();
      t.stored(task());
      t.hostaway.getReservationState.mockResolvedValue(value);

      expect(await t.service.reconcileWindow()).toMatchObject({ skipped: 1 });
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
      expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
    });

    it.each([
      { _phase_description: 'InExecution' },
      { ActualStartTime: '2026-11-25T14:00:00Z' },
      { TeamObservations: '[Pausado]: esperando llaves' },
      { _phase_description: 'Completed' },
      { _phase_description: 'Reviewed' },
    ])('reserva cancelada, pero la limpieza %j queda intacta', async (over) => {
      const t = setup();
      t.stored(task(over));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it('si empieza entre la lectura y la relectura no escribe ni deja la marca', async () => {
      const t = setup();
      t.stored(task());
      t.gateway.getTaskByIdWithSession.mockResolvedValue({
        data: task({ ActualStartTime: '2026-11-25T15:00:00Z' }),
      });
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
      expect(t.marks.size).toBe(0);
    });

    it('si la escritura falla y sigue abierta, la marca queda provisional y no cuenta', async () => {
      const t = setup();
      t.stored(task());
      t.gateway.updateCleaningTask.mockRejectedValue(new Error('caído'));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      await expect(t.service.reconcileReservation('R1')).rejects.toThrow(
        'caído',
      );
      expect(t.provisional.has('100')).toBe(true);
      expect(t.marks.size).toBe(0);
      expect(t.notices.record).not.toHaveBeenCalled();

      // Aunque el proceso se reinicie, una cancelación posterior a mano no se recrea.
      t.stored(cancelledTask());
      t.hostaway.getReservationState.mockResolvedValue(state());
      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
    });

    it.each([undefined, null, '', REASON])(
      'escritura con error pero aplicada (Notes %j): cancelada, avisa y cierra supervisiones',
      async (Notes) => {
        const t = setup();
        t.stored(task());
        t.gateway.getTaskByIdWithSession
          .mockResolvedValueOnce({ data: task() })
          .mockResolvedValue({ data: cancelledTask({ Notes }) });
        t.gateway.updateCleaningTask.mockRejectedValue(new Error('timeout'));
        t.hostaway.getReservationState.mockResolvedValue(
          state({ status: 'cancelled' }),
        );

        expect(await t.service.reconcileReservation('R1')).toBe('cancelled');
        expect(t.marks.has('100')).toBe(true);
        expect(t.notices.record).toHaveBeenCalledTimes(1);
        expect(t.supervisions.cancelOpenForTask).toHaveBeenCalledWith(100);

        t.stored(cancelledTask({ Notes }));
        t.hostaway.getReservationState.mockResolvedValue(state());
        expect(await t.service.reconcileReservation('R1')).toBe('created');
      },
    );

    it('si tras el error figura cancelada con otro motivo, fue una persona', async () => {
      const t = setup();
      t.stored(task());
      t.gateway.getTaskByIdWithSession
        .mockResolvedValueOnce({ data: task() })
        .mockResolvedValue({ data: cancelledTask({ Notes: 'Otro motivo' }) });
      t.gateway.updateCleaningTask.mockRejectedValue(new Error('timeout'));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
      expect(t.marks.size).toBe(0);
      expect(t.notices.record).not.toHaveBeenCalled();
    });

    it('si la escritura falla y no se puede releer, deja la marca y lanza', async () => {
      const t = setup();
      t.stored(task());
      t.gateway.getTaskByIdWithSession
        .mockResolvedValueOnce({ data: task() })
        .mockRejectedValue(new Error('caído'));
      t.gateway.updateCleaningTask.mockRejectedValue(new Error('timeout'));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      await expect(t.service.reconcileReservation('R1')).rejects.toThrow(
        'timeout',
      );
      expect(t.provisional.has('100')).toBe(true);
      expect(t.marks.size).toBe(0);
    });

    it('si en la relectura ya figura cancelada, la canceló otro: retira la marca', async () => {
      const t = setup();
      t.stored(task());
      t.gateway.getTaskByIdWithSession.mockResolvedValue({
        data: cancelledTask(),
      });
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('unchanged');
      expect(t.marks.size + t.provisional.size).toBe(0);
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it('cancela aunque haya una corrección a mano respetada y la base no se pueda leer', async () => {
      const t = setup();
      t.stored(task({ CheckoutDate: TOMORROW }));
      t.baselineRows.find.mockRejectedValue(new Error('pg'));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      expect(await t.service.reconcileWindow()).toMatchObject({
        cancelled: 1,
        failed: 0,
      });
    });

    it('un fallo al avisar o al cerrar supervisiones no deshace la cancelación', async () => {
      const t = setup();
      t.stored(task());
      t.notices.record.mockImplementation(() => {
        throw new Error('avisos');
      });
      t.supervisions.cancelOpenForTask.mockRejectedValue(new Error('superv'));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('cancelled');
    });

    it('consulta como mucho 5 reservas a la vez', async () => {
      const t = setup();
      t.gateway.findHostawayTasksByCheckout.mockImplementation((day: string) =>
        Promise.resolve(
          day === TODAY
            ? Array.from({ length: 12 }, (_, i) =>
                task({ _id: i + 1, HostawayReservation: `S${i}` }),
              )
            : [],
        ),
      );
      let active = 0;
      let max = 0;
      t.hostaway.getReservationState.mockImplementation(async () => {
        max = Math.max(max, ++active);
        await Promise.resolve();
        active--;
        return { kind: 'not_found' };
      });

      expect(await t.service.reconcileWindow()).toMatchObject({ skipped: 12 });
      expect(max).toBe(5);
    });
  });

  describe('canceladas y reserva activa', () => {
    it('la que canceló la sincronización se vuelve a crear', async () => {
      const t = setup();
      t.stored(cancelledTask());
      t.marks.add('100');
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row()] });
      t.hostaway.getReservationState.mockResolvedValue(state());

      expect(await t.service.reconcileWindow()).toMatchObject({ created: 1 });
      expect(t.cleaningTasks.createCleaningTask).toHaveBeenCalledWith(
        expect.objectContaining({ hostawayReservationId: 'R1' }),
        [100],
      );
    });

    it('no la recrea si entretanto Hostaway la volvió a cancelar', async () => {
      const t = setup();
      t.stored(cancelledTask());
      t.marks.add('100');
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row()] });
      t.hostaway.getReservationState.mockResolvedValue(
        state({ status: 'cancelled' }),
      );

      expect(await t.service.reconcileWindow()).toMatchObject({ unchanged: 1 });
      expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
    });

    it('la que canceló una persona no se recrea, y la tabla solo se consulta una vez', async () => {
      const t = setup();
      t.stored(cancelledTask());
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row()] });

      for (let i = 0; i < 3; i++) {
        expect(await t.service.reconcileWindow()).toMatchObject({ skipped: 1 });
      }
      expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
      expect(t.hostaway.getReservationState).not.toHaveBeenCalled();
      expect(t.cancellations.find).toHaveBeenCalledTimes(1);
    });

    it('basta una cancelada a mano para no recrear', async () => {
      const t = setup();
      t.stored(cancelledTask(), cancelledTask({ _id: 101 }));
      t.marks.add('100');
      t.hostaway.getReservationState.mockResolvedValue(state());

      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
    });

    it('si la tabla no responde no recrea', async () => {
      const t = setup();
      t.stored(cancelledTask());
      t.cancellations.find.mockRejectedValue(new Error('pg'));
      t.hostaway.getReservationState.mockResolvedValue(state());

      await expect(t.service.reconcileReservation('R1')).rejects.toThrow('pg');
      expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
    });
  });

  describe('cambio de fecha', () => {
    it('con el plan antes de la nueva salida quita operario y horario, y avisa', async () => {
      const t = setup();
      t.base();
      t.stored(
        task({
          Employee: 7,
          PlannedStartTime: '2026-11-25T17:00:00Z',
          PlannedEndTime: '2026-11-25T19:00:00Z',
        }),
      );
      t.hostaway.getCheckouts.mockResolvedValue({
        result: [row({ checkoutDate: TOMORROW })],
      });
      t.hostaway.getReservationState.mockResolvedValue(
        state({ checkoutDate: TOMORROW }),
      );

      expect(await t.service.reconcileWindow()).toMatchObject({ updated: 1 });
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(100, {
        CheckoutDate: TOMORROW,
        Employee: null,
        PlannedStartTime: null,
        PlannedEndTime: null,
      });
      expect(t.notices.record).toHaveBeenCalledWith(
        100,
        {
          employeeId: 7,
          plannedStartTime: '2026-11-25T17:00:00Z',
          plannedEndTime: '2026-11-25T19:00:00Z',
        },
        { employeeId: null, plannedStartTime: null, plannedEndTime: null },
      );
    });

    it.each([
      // 19:30 del 26 en Guayaquil, aunque en UTC ya sea 27.
      ['2026-11-27T00:30:00Z', TOMORROW, true],
      ['2026-11-27T15:00:00Z', TOMORROW, true],
      // 23:30 del 25 en Guayaquil, aunque en UTC ya sea 26.
      ['2026-11-26T04:30:00Z', TOMORROW, false],
      [undefined, TOMORROW, true],
    ])('plan %s y salida %s → se conserva: %s', async (start, date, keeps) => {
      const t = setup();
      t.base();
      t.stored(task({ Employee: 7, PlannedStartTime: start }));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ checkoutDate: date }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('updated');
      const body = (
        t.gateway.updateCleaningTask.mock.calls as unknown[][]
      )[0][1] as Record<string, unknown>;
      expect('Employee' in body).toBe(!keeps);
      expect(t.notices.record).toHaveBeenCalledTimes(keeps ? 0 : 1);
    });

    it('también corrige la que tenía la fecha fuera de la ventana', async () => {
      const t = setup();
      t.stored(task({ CheckoutDate: '2026-12-10' }));
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row()] });
      t.hostaway.getReservationState.mockResolvedValue(state());

      expect(await t.service.reconcileWindow()).toMatchObject({
        updated: 1,
        created: 0,
      });
    });

    it('la que se movió fuera de la ventana se actualiza, no se cancela', async () => {
      const t = setup();
      t.stored(task());
      t.hostaway.getReservationState.mockResolvedValue(
        state({ checkoutDate: '2026-12-10' }),
      );

      expect(await t.service.reconcileWindow()).toMatchObject({ updated: 1 });
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(100, {
        CheckoutDate: '2026-12-10',
      });
    });

    it('si ya empezó no se toca', async () => {
      const t = setup();
      t.stored(task({ _phase_description: 'InExecution' }));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ checkoutDate: TOMORROW }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it('si empieza entre la lectura y la relectura no escribe', async () => {
      const t = setup();
      t.stored(task());
      t.gateway.getTaskByIdWithSession.mockResolvedValue({
        data: task({ _phase_description: 'InExecution' }),
      });
      t.hostaway.getReservationState.mockResolvedValue(
        state({ checkoutDate: TOMORROW }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it('con duplicadas trabaja sobre la sin empezar más reciente', async () => {
      const t = setup();
      t.stored(
        task({ _id: 103, _phase_description: 'Completed' }),
        task({ _id: 101 }),
        task({ _id: 102 }),
      );
      t.hostaway.getReservationState.mockResolvedValue(
        state({ checkoutDate: TOMORROW }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('updated');
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledTimes(1);
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(102, {
        CheckoutDate: TOMORROW,
      });
    });
  });

  describe('cambio de alojamiento', () => {
    it.each([
      ['único', [{ _id: 5, HostawayListingID: 'L2' }], 5],
      [
        'ambiguo',
        [
          { _id: 5, HostawayListingID: 'L2' },
          { _id: 6, HostawayListingID: 'L2' },
        ],
        null,
      ],
      ['ninguno', [{ _id: 5, HostawayListingID: 'L9' }], null],
    ])('%s', async (_name, units, unit) => {
      const t = setup();
      t.base();
      t.stored(task({ Employee: 7 }));
      t.gateway.listUnitsWithListingOrThrow.mockResolvedValue(units);
      t.hostaway.getReservationState.mockResolvedValue(
        state({ listingId: 'L2', listingName: 'Apto 2' }),
      );

      expect(await t.service.reconcileReservation('R1')).toBe('updated');
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(100, {
        HostawayListingID: 'L2',
        Unit: unit,
        Description: 'Limpieza - Apto 2',
      });
      expect(t.notices.record).not.toHaveBeenCalled();
    });

    it('respeta una descripción escrita a mano', async () => {
      const t = setup();
      t.stored(task({ Description: 'Limpieza profunda' }));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ listingId: 'L2', listingName: 'Apto 2' }),
      );

      await t.service.reconcileReservation('R1');
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(100, {
        HostawayListingID: 'L2',
        Unit: null,
      });
    });

    it.each([
      [{ HostawayListingID: null }, {}],
      [{ HostawayListingID: '' }, {}],
      [{}, { listingId: '' }],
    ])('tarjeta %j y reserva %j → sin cambio', async (card, reservation) => {
      const t = setup();
      t.stored(task(card));
      t.hostaway.getReservationState.mockResolvedValue(state(reservation));

      expect(await t.service.reconcileReservation('R1')).toBe('unchanged');
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it('si no se pueden leer las unidades falla sin escribir', async () => {
      const t = setup();
      t.stored(task());
      t.gateway.listUnitsWithListingOrThrow.mockRejectedValue(new Error('om'));
      t.hostaway.getReservationState.mockResolvedValue(
        state({ listingId: 'L2' }),
      );

      await expect(t.service.reconcileReservation('R1')).rejects.toThrow('om');
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });
  });

  describe('línea base', () => {
    /** Lo que Hostaway dice hoy de R1, en el listado y por id. */
    const says = (t: ReturnType<typeof setup>, over: object = {}) => {
      t.hostaway.getCheckouts.mockResolvedValue({ result: [row(over)] });
      t.hostaway.getReservationState.mockResolvedValue(state(over));
    };
    const planned = {
      Employee: 7,
      PlannedStartTime: '2026-11-25T17:00:00Z',
      PlannedEndTime: '2026-11-25T19:00:00Z',
    };

    it.each([TOMORROW, '2026-12-10'])(
      'respeta la fecha corregida a mano (%s) en pasadas sucesivas, con un solo acceso a la tabla',
      async (corrected) => {
        const t = setup();
        t.base();
        t.stored(task({ ...planned, CheckoutDate: corrected }));
        says(t);

        for (let i = 0; i < 3; i++) {
          expect(await t.service.reconcileWindow()).toMatchObject({
            updated: 0,
            unchanged: 1,
            failed: 0,
          });
        }
        expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
        expect(t.baselineRows.find).toHaveBeenCalledTimes(1);
        expect(t.baselineRows.upsert).not.toHaveBeenCalled();
      },
    );

    it('un cambio real de Hostaway posterior a la corrección sí se aplica', async () => {
      const t = setup();
      t.base();
      t.stored(task({ ...planned, CheckoutDate: TOMORROW }));
      says(t);
      await t.service.reconcileWindow();

      says(t, { checkoutDate: '2026-11-28' });
      expect(await t.service.reconcileReservation('R1')).toBe('updated');
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(
        100,
        expect.objectContaining({ CheckoutDate: '2026-11-28', Employee: null }),
      );
      expect(t.bases.get('100')?.checkoutDate).toBe('2026-11-28');
    });

    it('cada campo por separado: aplica el listing y respeta la fecha', async () => {
      const t = setup();
      t.base();
      t.stored(task({ ...planned, CheckoutDate: TOMORROW }));
      says(t, { listingId: 'L2', listingName: 'Apto 2' });

      expect(await t.service.reconcileReservation('R1')).toBe('updated');
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledWith(100, {
        HostawayListingID: 'L2',
        Unit: null,
        Description: 'Limpieza - Apto 2',
      });
      expect(t.bases.get('100')).toMatchObject({
        checkoutDate: TODAY,
        listingId: 'L2',
      });
    });

    it('respeta el alojamiento cambiado a mano', async () => {
      const t = setup();
      t.base();
      t.stored(task({ HostawayListingID: 'L9', Unit: 55 }));
      says(t);

      expect(await t.service.reconcileReservation('R1')).toBe('unchanged');
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it.each([
      { Employee: 7 },
      { PlannedStartTime: planned.PlannedStartTime },
      { PlannedEndTime: planned.PlannedEndTime },
    ])(
      'sin base y planificada (%j): la adopta, no la toca y luego la respeta',
      async (plan) => {
        const t = setup();
        t.stored(task({ ...plan, CheckoutDate: TOMORROW }));
        says(t);

        expect(await t.service.reconcileWindow()).toMatchObject({ skipped: 1 });
        expect(t.bases.get('100')?.checkoutDate).toBe(TODAY);
        expect(await t.service.reconcileWindow()).toMatchObject({
          unchanged: 1,
        });
        expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
      },
    );

    it('sin base y sin planificar: aplica y guarda la base', async () => {
      const t = setup();
      t.stored(task({ CheckoutDate: TOMORROW }));
      says(t);

      expect(await t.service.reconcileWindow()).toMatchObject({ updated: 1 });
      expect(t.bases.get('100')).toEqual({
        taskId: '100',
        checkoutDate: TODAY,
        listingId: 'L1',
      });
    });

    it('al arrancar hace una lectura y un guardado por lote, y después ninguno', async () => {
      const t = setup();
      t.base(101);
      const cards = [1, 2, 3].map((n) =>
        task({ _id: 100 + n, HostawayReservation: `R${n}` }),
      );
      t.gateway.findHostawayTasksByCheckout.mockImplementation((day: string) =>
        Promise.resolve(day === TODAY ? cards : []),
      );
      t.hostaway.getCheckouts.mockResolvedValue({
        result: [1, 2, 3].map((n) => row({ reservationId: `R${n}` })),
      });

      await t.service.reconcileWindow();
      await t.service.reconcileWindow();

      expect(t.baselineRows.find).toHaveBeenCalledTimes(1);
      expect(t.baselineRows.upsert).toHaveBeenCalledTimes(1);
      const [rows] = t.baselineRows.upsert.mock.calls[0] as [BaselineRow[]];
      expect(rows.map((entry) => entry.taskId)).toEqual(['102', '103']);
    });

    it('guarda la base al crear; con id desconocido, en la pasada siguiente', async () => {
      const t = setup();
      says(t);
      await t.service.reconcileWindow();
      expect(t.bases.get('900')).toMatchObject({ checkoutDate: TODAY });

      t.bases.clear();
      const other = setup();
      says(other);
      other.cleaningTasks.createCleaningTask.mockResolvedValue({
        created: true,
        taskId: null,
      });
      expect(await other.service.reconcileWindow()).toMatchObject({
        created: 1,
      });
      expect(other.bases.size).toBe(0);
      other.stored(task());
      await other.service.reconcileWindow();
      expect(other.bases.has('100')).toBe(true);
    });

    it('si no se puede leer la base y hay diferencia, no escribe y cuenta el fallo', async () => {
      const t = setup();
      t.stored(task({ CheckoutDate: TOMORROW }));
      t.baselineRows.find.mockRejectedValue(new Error('pg'));
      says(t);

      expect(await t.service.reconcileWindow()).toMatchObject({
        updated: 0,
        failed: 1,
      });
      expect(t.gateway.updateCleaningTask).not.toHaveBeenCalled();
    });

    it('si no se puede leer ni guardar y no hay diferencia, la pasada sigue bien', async () => {
      const t = setup();
      t.stored(task());
      t.baselineRows.find.mockRejectedValue(new Error('pg'));
      t.baselineRows.upsert.mockRejectedValue(new Error('pg'));
      says(t);

      expect(await t.service.reconcileWindow()).toMatchObject({
        unchanged: 1,
        failed: 0,
      });
    });

    it('un guardado fallido se recuerda y se reintenta en la pasada siguiente', async () => {
      const t = setup();
      t.base();
      t.stored(task());
      t.baselineRows.upsert.mockRejectedValueOnce(new Error('pg'));
      says(t, { checkoutDate: TOMORROW });
      expect(await t.service.reconcileReservation('R1')).toBe('updated');

      // Corregida a mano antes de poder guardar la base: se respeta igual.
      t.stored(task({ ...planned, CheckoutDate: TODAY }));
      expect(await t.service.reconcileWindow()).toMatchObject({ unchanged: 1 });
      expect(t.gateway.updateCleaningTask).toHaveBeenCalledTimes(1);
      expect(t.bases.get('100')?.checkoutDate).toBe(TOMORROW);
    });

    it('si falla la escritura no actualiza la base', async () => {
      const t = setup();
      t.base();
      t.stored(task());
      t.gateway.updateCleaningTask.mockRejectedValue(new Error('caído'));
      says(t, { checkoutDate: TOMORROW });

      await expect(t.service.reconcileReservation('R1')).rejects.toThrow(
        'caído',
      );
      expect(t.bases.get('100')?.checkoutDate).toBe(TODAY);
      expect(t.baselineRows.upsert).not.toHaveBeenCalled();
    });

    it('escritura con error pero aplicada: cuenta, guarda la base y avisa', async () => {
      const t = setup();
      t.base();
      t.stored(task(planned));
      t.gateway.getTaskByIdWithSession
        .mockResolvedValueOnce({ data: task(planned) })
        .mockResolvedValue({
          data: task({ CheckoutDate: TOMORROW, Employee: null }),
        });
      t.gateway.updateCleaningTask.mockRejectedValue(new Error('timeout'));
      says(t, { checkoutDate: TOMORROW });

      expect(await t.service.reconcileReservation('R1')).toBe('updated');
      expect(t.bases.get('100')?.checkoutDate).toBe(TOMORROW);
      expect(t.notices.record).toHaveBeenCalledTimes(1);
    });

    it('escritura con error y tarjeta a medias: lanza sin avisar', async () => {
      const t = setup();
      t.base();
      t.stored(task(planned));
      t.gateway.getTaskByIdWithSession
        .mockResolvedValueOnce({ data: task(planned) })
        .mockResolvedValue({
          data: task({ ...planned, CheckoutDate: TOMORROW }),
        });
      t.gateway.updateCleaningTask.mockRejectedValue(new Error('timeout'));
      says(t, { checkoutDate: TOMORROW });

      await expect(t.service.reconcileReservation('R1')).rejects.toThrow(
        'timeout',
      );
      expect(t.notices.record).not.toHaveBeenCalled();
    });
  });

  describe('concurrencia', () => {
    it('enfriamiento: no llama a nadie ni cuenta como pasada', async () => {
      const t = setup();
      t.session.isCoolingDown.mockReturnValue(true);

      expect(await t.service.reconcileWindow()).toMatchObject({ failed: 0 });
      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
      expect(t.hostaway.getCheckouts).not.toHaveBeenCalled();
      expect(t.hostaway.getReservationState).not.toHaveBeenCalled();
      expect(t.service.status().lastRunAt).toBeNull();
    });

    it('dos pasadas a la vez comparten la misma', async () => {
      const t = setup();
      const [a, b] = await Promise.all([
        t.service.reconcileWindow(),
        t.service.reconcileWindow(),
      ]);
      expect(a).toBe(b);
      expect(t.hostaway.getCheckouts).toHaveBeenCalledTimes(1);
    });

    it('una pasada colgada caduca a los 10 min y, si despierta, no escribe', async () => {
      const t = setup();
      let wake: (value: unknown) => void = () => undefined;
      t.hostaway.getCheckouts.mockReturnValueOnce(
        new Promise((resolve) => (wake = resolve)),
      );
      const stuck = t.service.reconcileWindow();
      stuck.catch(() => undefined);

      jest.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
      await t.service.reconcileWindow();
      expect(t.hostaway.getCheckouts).toHaveBeenCalledTimes(2);
      const { lastSuccessAt } = t.service.status();
      expect(lastSuccessAt).not.toBeNull();

      wake({ result: [row()] });
      await expect(stuck).rejects.toThrow();
      expect(t.cleaningTasks.createCleaningTask).not.toHaveBeenCalled();
      expect(t.service.status().lastSuccessAt).toBe(lastSuccessAt);
    });

    it('la misma reserva nunca se trabaja dos veces a la vez', async () => {
      const t = setup();
      let active = 0;
      let max = 0;
      t.hostaway.getReservationState.mockImplementation(async () => {
        max = Math.max(max, ++active);
        await Promise.resolve();
        active--;
        return { kind: 'not_found' };
      });

      await Promise.all([
        t.service.reconcileReservation('R1'),
        t.service.reconcileReservation('R1'),
      ]);
      expect(t.hostaway.getReservationState).toHaveBeenCalledTimes(2);
      expect(max).toBe(1);
    });

    it('un fallo no bloquea la cola de esa reserva', async () => {
      const t = setup();
      t.hostaway.getReservationState.mockRejectedValueOnce(new Error('503'));

      await expect(t.service.reconcileReservation('R1')).rejects.toThrow();
      expect(await t.service.reconcileReservation('R1')).toBe('skipped');
    });
  });

  describe('señal', () => {
    it('dos señales seguidas hacen una sola reconciliación, a los 5 s', async () => {
      const t = setup();
      t.service.signal('R1');
      t.service.signal('R1');
      await jest.advanceTimersByTimeAsync(4_900);
      expect(t.hostaway.getReservationState).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(200);
      expect(t.hostaway.getReservationState).toHaveBeenCalledTimes(1);

      t.service.signal('R1');
      await jest.advanceTimersByTimeAsync(5_000);
      expect(t.hostaway.getReservationState).toHaveBeenCalledTimes(2);
    });

    it('con el flag apagado no hace nada', async () => {
      const t = setup({ HOSTAWAY_SCHEDULER_ENABLED: 'false' });
      t.service.signal('R1');
      await jest.advanceTimersByTimeAsync(10_000);
      expect(t.hostaway.getReservationState).not.toHaveBeenCalled();
      expect(t.service.status().enabled).toBe(false);
    });

    it('un fallo no se propaga y las siguientes se atienden', async () => {
      const t = setup();
      t.hostaway.getReservationState.mockRejectedValueOnce(new Error('503'));
      t.service.signal('R1');
      t.service.signal('R2');
      await jest.advanceTimersByTimeAsync(5_000);
      expect(t.hostaway.getReservationState).toHaveBeenCalledWith('R2');
    });

    it.each(['', '  ', '../x', undefined])('ignora el id %j', async (id) => {
      const t = setup();
      expect(() => t.service.signal(id as string)).not.toThrow();
      await jest.advanceTimersByTimeAsync(5_000);
      expect(t.hostaway.getReservationState).not.toHaveBeenCalled();
    });

    it('al apagar se descartan las pendientes', async () => {
      const t = setup();
      t.service.signal('R1');
      t.service.onModuleDestroy();
      t.service.signal('R2');
      await jest.advanceTimersByTimeAsync(10_000);
      expect(t.hostaway.getReservationState).not.toHaveBeenCalled();
    });

    it('la lista de pendientes tiene tope', async () => {
      const t = setup();
      for (let i = 0; i < 250; i++) t.service.signal(`S${i}`);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(t.hostaway.getReservationState).toHaveBeenCalledTimes(200);
    });
  });

  it('status refleja la última pasada', async () => {
    const t = setup();
    expect(t.service.status()).toEqual({
      enabled: true,
      windowDays: 2,
      lastRunAt: null,
      lastSuccessAt: null,
      lastResult: null,
    });

    const result = await t.service.reconcileWindow();
    expect(t.service.status()).toEqual({
      enabled: true,
      windowDays: 2,
      lastRunAt: NOW.toISOString(),
      lastSuccessAt: NOW.toISOString(),
      lastResult: result,
    });
  });
});
