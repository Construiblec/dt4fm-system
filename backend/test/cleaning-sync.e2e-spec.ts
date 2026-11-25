import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { GuestStayService } from '../src/modules/access-control/guest-stay.service';
import { CleaningNoticesService } from '../src/modules/cleaning-tasks/cleaning-notices.service';
import { CleaningSyncService } from '../src/modules/cleaning-tasks/cleaning-sync.service';
import {
  CleaningTasksService,
  guayaquilToday,
} from '../src/modules/cleaning-tasks/cleaning-tasks.service';
import { CleaningTasksSessionService } from '../src/modules/cleaning-tasks/cleaning-tasks.session.service';
import { PHASE_IDS } from '../src/modules/cleaning-tasks/constants/phase.constants';
import { HostawaySyncSchedulerService } from '../src/modules/cleaning-tasks/hostaway-sync.scheduler.service';
import { CleaningStore, upstreamError } from './helpers/cleaning-store';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { MOCK_SESSION_ID, mockSession } from './mocks/openmaint-core.mock';

const READ_KEY = 'e2e-clave-listado-0123456789abcdefghij';
const WRITE_KEY = 'e2e-escritura-cambios-0123456789abcdefghij';
const CANCEL_REASON = 'Reserva cancelada en Hostaway';

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 300 && !condition(); i += 1) await pause(10);
  expect(condition()).toBe(true);
};

type Reservation = {
  status: string;
  checkoutDate: string | null;
  listingId: string;
  listingName: string;
};

/** Un proceso: app completa con su propio pool de Postgres. */
type Instance = {
  app: INestApplication;
  mocks: TestAppMocks;
  sync: CleaningSyncService;
  tasks: CleaningTasksService;
  notices: CleaningNoticesService;
  isCoolingDown: jest.SpyInstance;
};

const startInstance = async (): Promise<Instance> => {
  const { app, mocks } = await createTestApp();
  // El cron real no debe colarse en una prueba con el flag encendido.
  for (const job of app.get(SchedulerRegistry).getCronJobs().values()) {
    void job.stop();
  }
  const session = app.get(CleaningTasksSessionService);
  jest.spyOn(session, 'getSessionId').mockResolvedValue(MOCK_SESSION_ID);
  return {
    app,
    mocks,
    sync: app.get(CleaningSyncService),
    tasks: app.get(CleaningTasksService),
    notices: app.get(CleaningNoticesService),
    isCoolingDown: jest.spyOn(session, 'isCoolingDown').mockReturnValue(false),
  };
};

describe('Sincronización de limpiezas (e2e)', () => {
  let one: Instance;
  let two: Instance;
  let dataSource: DataSource;
  let store: CleaningStore;
  let today: string;
  let tomorrow: string;
  const reservations = new Map<string, Reservation>();
  let lastReservation = 7_000_000;

  const gateway = () => one.mocks.cleaningTasksOpenmaint;
  const hostaway = () => one.mocks.hostaway;
  const created = () =>
    [one, two].flatMap(
      ({ mocks }) =>
        mocks.cleaningTasksOpenmaint.createCleaningTask.mock
          .calls as unknown[][],
    );
  const updates = () => gateway().updateCleaningTask.mock.calls as unknown[][];
  const marks = (): Promise<{ task_id: string; reservation_id: string }[]> =>
    dataSource.query(
      'SELECT task_id, reservation_id FROM "cleaning_sync_cancellation" ORDER BY task_id',
    );

  /** Reserva nueva en Hostaway, con un id que ninguna otra prueba usó. */
  const reserve = (overrides: Partial<Reservation> = {}): string => {
    const id = String(lastReservation++);
    reservations.set(id, {
      status: 'new',
      checkoutDate: today,
      listingId: '331',
      listingName: `Suite ${id}`,
      ...overrides,
    });
    return id;
  };
  const change = (id: string, changes: Partial<Reservation>) =>
    Object.assign(reservations.get(id) as Reservation, changes);

  const only = (reservationId: string) => {
    const cards = store.byReservation(reservationId);
    expect(cards).toHaveLength(1);
    return cards[0];
  };

  const attachHostaway = ({ mocks }: Instance) => {
    mocks.hostaway.getCheckouts
      .mockReset()
      .mockImplementation((from: string, to: string) =>
        Promise.resolve({
          result: [...reservations.entries()]
            .filter(
              ([, { status, checkoutDate }]) =>
                ['new', 'modified', 'confirmed'].includes(status) &&
                checkoutDate !== null &&
                checkoutDate >= from &&
                checkoutDate <= to,
            )
            .map(([reservationId, r]) => ({
              reservationId,
              guestName: 'Ana Pérez',
              listingName: r.listingName,
              listingId: r.listingId,
              checkoutDate: r.checkoutDate,
              checkoutTime: 11,
            })),
        }),
      );
    mocks.hostaway.getReservationState
      .mockReset()
      .mockImplementation((id: string) => {
        const found = reservations.get(id);
        return Promise.resolve(
          found
            ? {
                kind: 'found',
                checkoutTime: 11,
                guestName: 'Ana Pérez',
                ...found,
              }
            : { kind: 'not_found' },
        );
      });
  };

  beforeAll(async () => {
    [one, two] = [await startInstance(), await startInstance()];
    dataSource = one.app.get(DataSource);
  });

  beforeEach(async () => {
    await one.notices.flush();
    await two.notices.flush();
    resetMockCalls();
    await dataSource.query('DELETE FROM "cleaning_sync_cancellation"');
    await dataSource.query('DELETE FROM "cleaning_sync_baseline"');

    today = guayaquilToday();
    tomorrow = addDays(today, 1);
    reservations.clear();
    store = new CleaningStore();
    for (const instance of [one, two]) {
      store.attach(instance.mocks.cleaningTasksOpenmaint);
      attachHostaway(instance);
      instance.isCoolingDown.mockReturnValue(false);
      const supervisions = instance.mocks.cleaningSupervisionsOpenmaint;
      supervisions.findByTask.mockReset().mockResolvedValue([]);
      supervisions.updateSupervision.mockReset().mockResolvedValue(null);
    }
  });

  afterAll(async () => {
    await dataSource?.query('DELETE FROM "cleaning_sync_cancellation"');
    await dataSource?.query('DELETE FROM "cleaning_sync_baseline"');
    await one?.app.close();
    await two?.app.close();
  });

  describe('barrido', () => {
    it('crea lo que falta de hoy y mañana, y repetido no duplica', async () => {
      const first = reserve();
      const second = reserve({ checkoutDate: tomorrow, status: 'modified' });
      const later = reserve({ checkoutDate: addDays(today, 2) });
      const inquiry = reserve({ status: 'inquiry' });

      const result = await one.sync.reconcileWindow();

      expect(result).toEqual({
        dateFrom: today,
        dateTo: tomorrow,
        created: 2,
        updated: 0,
        cancelled: 0,
        unchanged: 0,
        skipped: 0,
        failed: 0,
      });
      expect(only(first)).toMatchObject({
        _phase_description: 'Assigned',
        CheckoutDate: today,
        HostawayListingID: '331',
        Description: `Limpieza - Suite ${first}`,
        Employee: null,
      });
      expect(only(second).CheckoutDate).toBe(tomorrow);
      expect(store.byReservation(later)).toEqual([]);
      expect(store.byReservation(inquiry)).toEqual([]);

      expect(await one.sync.reconcileWindow()).toMatchObject({
        created: 0,
        unchanged: 2,
      });
      expect(created()).toHaveLength(2);
      expect(updates()).toEqual([]);
    });

    it('deja el resultado en GET /cleaning-sync', async () => {
      reserve();
      const result = await one.sync.reconcileWindow();

      const { body } = await request(one.app.getHttpServer())
        .get('/integrations/v1/cleaning-sync')
        .set('x-api-key', READ_KEY)
        .expect(200);

      expect(body.data).toEqual({
        enabled: false,
        windowDays: 2,
        lastRunAt: expect.any(String) as string,
        lastSuccessAt: body.data.lastRunAt,
        lastResult: result,
      });

      hostaway().getCheckouts.mockRejectedValueOnce(new Error('caído'));
      await expect(one.sync.reconcileWindow()).rejects.toThrow();
      const failed = await request(one.app.getHttpServer())
        .get('/integrations/v1/cleaning-sync')
        .set('x-api-key', READ_KEY)
        .expect(200);
      expect(failed.body.data.lastSuccessAt).toBe(body.data.lastSuccessAt);
      expect(failed.body.data.lastResult.failed).toBeGreaterThan(0);
    });

    it('de noche, «hoy» sigue siendo el día de Guayaquil', async () => {
      jest.useFakeTimers({
        doNotFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'clearImmediate',
          'nextTick',
          'queueMicrotask',
          'performance',
          'hrtime',
        ],
        // 20:30 del 25 en Guayaquil.
        now: new Date('2026-11-26T01:30:00Z'),
      });
      try {
        await one.sync.reconcileWindow();
      } finally {
        jest.useRealTimers();
      }

      expect(hostaway().getCheckouts).toHaveBeenCalledWith(
        '2026-11-25',
        '2026-11-26',
      );
    });

    it('en enfriamiento no consulta nada', async () => {
      reserve();
      one.isCoolingDown.mockReturnValue(true);

      expect(await one.sync.reconcileWindow()).toMatchObject({ created: 0 });

      expect(hostaway().getCheckouts).not.toHaveBeenCalled();
      expect(created()).toEqual([]);
    });

    it('el cron solo trabaja con el flag encendido', async () => {
      const scheduler = one.app.get(HostawaySyncSchedulerService);
      reserve();

      await scheduler.run();
      expect(hostaway().getCheckouts).not.toHaveBeenCalled();

      process.env.HOSTAWAY_SCHEDULER_ENABLED = 'true';
      try {
        await scheduler.run();
        expect(created()).toHaveLength(1);

        // Un fallo no sale del proceso programado.
        hostaway().getCheckouts.mockRejectedValueOnce(new Error('caído'));
        await expect(scheduler.run()).resolves.toBeUndefined();
      } finally {
        process.env.HOSTAWAY_SCHEDULER_ENABLED = 'false';
      }
    });
  });

  describe('sin duplicados', () => {
    /** Las dos primeras comprobaciones responden a la vez, antes de crear nada. */
    const bothMissFirst = () => {
      let seen = 0;
      let open = () => {};
      const gate = new Promise<void>((resolve) => (open = resolve));
      for (const { mocks } of [one, two]) {
        const api = mocks.cleaningTasksOpenmaint;
        api.taskExistsByReservationId.mockImplementation(async (id: string) => {
          const exists = store.byReservation(id).length > 0;
          seen += 1;
          if (seen <= 2) {
            if (seen === 2) open();
            await gate;
          }
          return exists;
        });
        const create = api.createCleaningTask.getMockImplementation();
        api.createCleaningTask.mockImplementation(async (body: object) => {
          await pause(100);
          return create?.(body) as unknown;
        });
      }
    };

    const dto = (hostawayReservationId: string) => ({
      hostawayReservationId,
      listingName: 'Suite Azul',
      listingId: '331',
      checkoutDate: today,
      checkoutTime: '11:00',
    });

    it('dos procesos reconciliando a la vez crean una sola', async () => {
      const id = reserve();
      bothMissFirst();

      const results = await Promise.all([
        one.sync.reconcileWindow(),
        two.sync.reconcileWindow(),
      ]);

      only(id);
      expect(created()).toHaveLength(1);
      expect(results.map((r) => r.created).sort()).toEqual([0, 1]);
      expect(results.map((r) => r.failed)).toEqual([0, 0]);
    });

    it('la sincronización y el botón a la vez crean una sola', async () => {
      const id = reserve();
      bothMissFirst();

      const [action, button] = await Promise.all([
        one.sync.reconcileReservation(id),
        request(two.app.getHttpServer())
          .post('/cleaning-tasks')
          .send(dto(id))
          .expect(201),
      ]);

      only(id);
      expect(created()).toHaveLength(1);
      expect([action === 'created', button.body.created].sort()).toEqual([
        false,
        true,
      ]);
    });

    it('dos altas en el mismo proceso crean una sola', async () => {
      const id = reserve();
      bothMissFirst();

      const results = await Promise.all([
        one.tasks.createCleaningTask(dto(id)),
        one.tasks.createCleaningTask(dto(id)),
      ]);

      only(id);
      expect(results.map((r) => r.created).sort()).toEqual([false, true]);
    });

    it('muchas reservas a la vez en dos procesos: una por reserva y sin bloqueos', async () => {
      const ids = Array.from({ length: 12 }, () => reserve());

      const [generated] = await Promise.all([
        one.tasks.generateTasksFromCheckouts(ids.map(dto)),
        two.sync.reconcileWindow(),
      ]);

      ids.forEach(only);
      expect(generated).toMatchObject({ total: 12, failed: 0 });
      expect(created()).toHaveLength(12);
    });

    it('la señal y el barrido de la misma reserva crean una sola', async () => {
      const id = reserve();

      await Promise.all([
        one.sync.reconcileReservation(id),
        one.sync.reconcileWindow(),
        one.sync.reconcileReservation(id),
      ]);

      only(id);
    });

    it('la reserva que revive se recrea una vez aunque lo intenten dos procesos', async () => {
      const id = reserve();
      await one.sync.reconcileReservation(id);
      change(id, { status: 'cancelled' });
      await one.sync.reconcileReservation(id);
      change(id, { status: 'new' });

      await Promise.all([
        one.sync.reconcileReservation(id),
        two.sync.reconcileReservation(id),
      ]);

      expect(
        store
          .byReservation(id)
          .map((card) => card._phase_description)
          .sort(),
      ).toEqual(['Assigned', 'Cancelled']);
    });
  });

  describe('cambios en la reserva', () => {
    it('cambió la salida y el plan quedó antes: libera al operario y avisa', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const card = only(id);
      Object.assign(card, {
        Employee: 7001,
        PlannedStartTime: `${today}T16:00:00Z`,
        PlannedEndTime: `${today}T17:00:00Z`,
      });
      change(id, { checkoutDate: tomorrow });

      expect(await one.sync.reconcileWindow()).toMatchObject({ updated: 1 });
      await one.notices.flush();

      expect(updates()).toEqual([
        [
          card._id,
          {
            CheckoutDate: tomorrow,
            Employee: null,
            PlannedStartTime: null,
            PlannedEndTime: null,
          },
        ],
      ]);
      expect(
        one.mocks.pushDispatch.notifyCleaningPlanUpdated.mock.calls,
      ).toEqual([
        [
          {
            cleaningEmployeeId: 7001,
            counts: { assigned: 0, rescheduled: 0, removed: 1, cancelled: 0 },
          },
        ],
      ]);
    });

    it('cambió la salida pero el plan sigue valiendo: solo la fecha', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const card = only(id);
      Object.assign(card, {
        Employee: 7001,
        PlannedStartTime: `${tomorrow}T16:00:00Z`,
        PlannedEndTime: `${tomorrow}T17:00:00Z`,
      });
      change(id, { checkoutDate: tomorrow });

      await one.sync.reconcileWindow();

      expect(updates()).toEqual([[card._id, { CheckoutDate: tomorrow }]]);
    });

    it.each([
      ['única', [{ _id: 301, HostawayListingID: '332' }], 301],
      [
        'ambigua',
        [
          { _id: 301, HostawayListingID: '332' },
          { _id: 302, HostawayListingID: '332' },
        ],
        null,
      ],
    ])('cambió de alojamiento, con unidad %s', async (_case, units, unit) => {
      const id = reserve();
      await one.sync.reconcileWindow();
      gateway().listUnitsWithListingOrThrow.mockResolvedValue(units);
      change(id, { listingId: '332', listingName: 'Suite Verde' });

      expect(await one.sync.reconcileReservation(id)).toBe('updated');

      expect(only(id)).toMatchObject({
        HostawayListingID: '332',
        Description: 'Limpieza - Suite Verde',
        Unit: unit,
      });
    });

    it.each([
      ['en ejecución', { phase: PHASE_IDS.IN_EXECUTION }],
      ['en pausa', { TeamObservations: 'x [Pausado]' }],
      ['terminada', { phase: PHASE_IDS.COMPLETED }],
    ])('%s: ni se mueve ni se cancela', async (_case, state) => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const card = only(id);
      store.put(card._id, {
        ...card,
        ActualStartTime: `${today}T15:00:00Z`,
        ...state,
      });

      change(id, { checkoutDate: tomorrow });
      await one.sync.reconcileWindow();
      change(id, { status: 'cancelled' });
      await one.sync.reconcileWindow();
      await one.sync.reconcileReservation(id);

      expect(updates()).toEqual([]);
      expect(await marks()).toEqual([]);
      expect(only(id).CheckoutDate).toBe(today);
    });
  });

  describe('fecha corregida a mano', () => {
    const correct = {
      'la API': async (taskId: number, checkoutDate: string) => {
        await request(one.app.getHttpServer())
          .patch(`/integrations/v1/cleanings/${taskId}`)
          .set('x-api-key', WRITE_KEY)
          .send({ checkoutDate })
          .expect(200);
      },
      coordinación: async (taskId: number, checkoutDate: string) => {
        one.mocks.openmaint.getSession.mockResolvedValue(
          mockSession({ role: 'SupervisorLimpieza' }),
        );
        await request(one.app.getHttpServer())
          .put(`/cleaning-tasks/${taskId}`)
          .set('x-session-token', 'mock-session-token')
          .send({ checkoutDate })
          .expect(200);
      },
    };

    describe.each(Object.keys(correct) as (keyof typeof correct)[])(
      'por %s',
      (who) => {
        it.each([
          ['dentro de la ventana', 1],
          ['fuera de la ventana', 5],
        ])('%s: no se revierte en las pasadas siguientes', async (_c, days) => {
          const id = reserve();
          await one.sync.reconcileWindow();
          const { _id } = only(id);
          const corrected = addDays(today, days);
          await correct[who](_id, corrected);
          gateway().updateCleaningTask.mockClear();

          expect(await one.sync.reconcileWindow()).toMatchObject({
            created: 0,
            updated: 0,
            cancelled: 0,
            failed: 0,
          });
          await one.sync.reconcileReservation(id);
          // Otro proceso, sin nada en memoria.
          await two.sync.reconcileWindow();

          expect(only(id).CheckoutDate).toBe(corrected);
          expect(updates()).toEqual([]);
          expect(
            two.mocks.cleaningTasksOpenmaint.updateCleaningTask,
          ).not.toHaveBeenCalled();
        });

        it('si Hostaway cambia después, sí se actualiza', async () => {
          const id = reserve();
          await one.sync.reconcileWindow();
          const { _id } = only(id);
          await correct[who](_id, addDays(today, 3));
          await one.sync.reconcileWindow();

          change(id, { checkoutDate: tomorrow });
          expect(await one.sync.reconcileReservation(id)).toBe('updated');

          expect(only(id).CheckoutDate).toBe(tomorrow);
        });

        it('una corrección no impide cancelar si la reserva se cancela', async () => {
          const id = reserve();
          await one.sync.reconcileWindow();
          await correct[who](only(id)._id, tomorrow);

          change(id, { status: 'cancelled' });
          await one.sync.reconcileWindow();

          expect(only(id)._phase_description).toBe('Cancelled');
        });
      },
    );

    it('Hostaway alcanza la corrección y luego vuelve: se sigue a Hostaway', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      await correct['la API'](only(id)._id, tomorrow);
      change(id, { checkoutDate: tomorrow });
      await one.sync.reconcileWindow();

      change(id, { checkoutDate: today });
      await one.sync.reconcileWindow();

      expect(only(id).CheckoutDate).toBe(today);
    });

    it.each([
      ['sin planificar: se pone al día', null, 'updated'],
      ['planificada: se respeta', 7001, 'skipped'],
    ])('limpieza anterior a la tabla, %s', async (_case, Employee, action) => {
      const id = reserve({ checkoutDate: tomorrow });
      const taskId = 9_000_000 + lastReservation;
      store.put(taskId, {
        HostawayReservation: id,
        HostawayListingID: '331',
        CheckoutDate: today,
        Employee,
      });

      expect(await one.sync.reconcileReservation(id)).toBe(action);
      await two.sync.reconcileWindow();

      expect(only(id).CheckoutDate).toBe(
        action === 'updated' ? tomorrow : today,
      );
    });

    it('corregida varias veces tras un cambio de Hostaway, manda lo último', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const { _id } = only(id);
      change(id, { checkoutDate: tomorrow });
      await one.sync.reconcileWindow();
      await correct['la API'](_id, today);

      await one.sync.reconcileWindow();
      await one.sync.reconcileReservation(id);

      expect(only(id).CheckoutDate).toBe(today);
    });
  });

  describe('cancelación y vuelta', () => {
    it.each([
      'cancelled',
      'declined',
      'expired',
      'inquirydenied',
      'inquirytimedout',
      'inquirynotpossible',
    ])('%s: cancela la no empezada y la marca', async (status) => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const { _id } = only(id);
      change(id, { status });

      expect(await one.sync.reconcileWindow()).toMatchObject({
        cancelled: 1,
        failed: 0,
      });

      expect(updates()).toEqual([
        [_id, { phase: PHASE_IDS.CANCELLED, Notes: CANCEL_REASON }],
      ]);
      expect(await marks()).toEqual([
        { task_id: String(_id), reservation_id: id },
      ]);
      // Repetirla no vuelve a escribir.
      await one.sync.reconcileWindow();
      await one.sync.reconcileReservation(id);
      expect(updates()).toHaveLength(1);
    });

    it('avisa al operario y anula su supervisión abierta', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const card = only(id);
      Object.assign(card, { Employee: 7002 });
      const supervisions = one.mocks.cleaningSupervisionsOpenmaint;
      supervisions.findByTask.mockResolvedValue([
        { _id: 71, CleaningTask: card._id, _Phase_code: 'Draft' },
      ]);
      change(id, { status: 'cancelled' });

      await one.sync.reconcileReservation(id);
      await one.notices.flush();

      expect(supervisions.updateSupervision).toHaveBeenCalledTimes(1);
      expect(
        one.mocks.pushDispatch.notifyCleaningPlanUpdated.mock.calls,
      ).toEqual([
        [
          {
            cleaningEmployeeId: 7002,
            counts: { assigned: 0, rescheduled: 0, removed: 0, cancelled: 1 },
          },
        ],
      ]);
    });

    it.each(['barrido', 'señal'])('revive: se crea otra (%s)', async (how) => {
      const run = (id: string) =>
        how === 'señal'
          ? one.sync.reconcileReservation(id)
          : one.sync.reconcileWindow();
      const id = reserve();
      await run(id);
      const old = only(id)._id;
      change(id, { status: 'cancelled' });
      await run(id);
      change(id, { status: 'modified' });

      await run(id);

      const cards = store.byReservation(id);
      expect(cards).toHaveLength(2);
      expect(store.get(old)._phase_description).toBe('Cancelled');
      const revived = cards.find(({ _id }) => _id !== old);
      expect(revived).toMatchObject({
        _phase_description: 'Assigned',
        CheckoutDate: today,
      });

      // Y vuelve a cancelarse y revivir sin arrastrar las anteriores.
      await run(id);
      expect(store.byReservation(id)).toHaveLength(2);
      change(id, { status: 'cancelled' });
      await run(id);
      change(id, { status: 'new' });
      await run(id);
      expect(store.byReservation(id)).toHaveLength(3);
      expect(await marks()).toHaveLength(2);
    });

    it('revive en otro proceso: la marca está en la base, no en memoria', async () => {
      const id = reserve();
      await one.sync.reconcileReservation(id);
      change(id, { status: 'cancelled' });
      await one.sync.reconcileReservation(id);
      change(id, { status: 'new' });

      expect(await two.sync.reconcileReservation(id)).toBe('created');
    });

    it.each(['la API', 'coordinación'])(
      'cancelada a mano por %s: no se recrea',
      async (who) => {
        const id = reserve();
        await one.sync.reconcileWindow();
        const { _id } = only(id);
        if (who === 'la API') {
          await request(one.app.getHttpServer())
            .post(`/integrations/v1/cleanings/${_id}/cancel`)
            .set('x-api-key', WRITE_KEY)
            .send({ reason: 'No hace falta' })
            .expect(200);
        } else {
          store.put(_id, { ...store.get(_id), phase: PHASE_IDS.CANCELLED });
        }

        for (const { sync } of [one, two]) {
          expect(await sync.reconcileWindow()).toMatchObject({
            created: 0,
            skipped: 1,
          });
          expect(await sync.reconcileReservation(id)).toBe('skipped');
        }
        // Aunque la reserva se cancele y vuelva.
        change(id, { status: 'cancelled' });
        await one.sync.reconcileReservation(id);
        change(id, { status: 'new' });
        await one.sync.reconcileReservation(id);

        only(id);
        expect(await marks()).toEqual([]);
      },
    );

    it('cancelada por la sincronización, recreada y luego cancelada a mano: no se recrea', async () => {
      const id = reserve();
      await one.sync.reconcileReservation(id);
      change(id, { status: 'cancelled' });
      await one.sync.reconcileReservation(id);
      change(id, { status: 'new' });
      await one.sync.reconcileReservation(id);
      const second = store
        .byReservation(id)
        .find((card) => card._phase_description === 'Assigned');
      if (!second) throw new Error('No se recreó');
      store.put(second._id, {
        ...second,
        phase: PHASE_IDS.CANCELLED,
        Notes: 'Decisión de coordinación',
      });

      expect(await one.sync.reconcileReservation(id)).toBe('skipped');
      expect(store.byReservation(id)).toHaveLength(2);
    });

    it('empieza justo antes de cancelarla: intacta y sin marca', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const card = only(id);
      change(id, { status: 'cancelled' });
      gateway().getTaskByIdWithSession.mockImplementation(() =>
        Promise.resolve({
          data: {
            ...card,
            phase: PHASE_IDS.IN_EXECUTION,
            _phase_description: 'InExecution',
            ActualStartTime: `${today}T15:00:00Z`,
          },
        }),
      );

      expect(await one.sync.reconcileReservation(id)).toBe('skipped');

      expect(updates()).toEqual([]);
      expect(await marks()).toEqual([]);
    });

    it('si la cancelación falla, la siguiente pasada la reintenta', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      change(id, { status: 'cancelled' });
      gateway().updateCleaningTask.mockRejectedValueOnce(upstreamError(500));

      await expect(one.sync.reconcileReservation(id)).rejects.toThrow();
      expect(only(id)._phase_description).toBe('Assigned');

      expect(await one.sync.reconcileReservation(id)).toBe('cancelled');
      expect(await marks()).toHaveLength(1);
    });

    it('la cancelación se guardó aunque respondiera con error: cuenta como suya', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const { _id } = only(id);
      change(id, { status: 'cancelled' });
      gateway().updateCleaningTask.mockImplementationOnce(() => {
        store.put(_id, {
          ...store.get(_id),
          phase: PHASE_IDS.CANCELLED,
          Notes: CANCEL_REASON,
        });
        return Promise.reject(upstreamError(504));
      });

      expect(await one.sync.reconcileReservation(id)).toBe('cancelled');
      change(id, { status: 'new' });
      expect(await one.sync.reconcileReservation(id)).toBe('created');
    });

    /** Una cancelación que no llegó a guardarse. */
    const failCancel = async (id: string) => {
      change(id, { status: 'cancelled' });
      gateway().updateCleaningTask.mockRejectedValueOnce(upstreamError(500));
      await expect(one.sync.reconcileReservation(id)).rejects.toThrow();
    };
    const cancelByHand = (taskId: number) =>
      store.put(taskId, {
        ...store.get(taskId),
        phase: PHASE_IDS.CANCELLED,
        Notes: 'Decisión de coordinación',
      });

    it('cancelación fallida y la reserva revive: si luego la cancela una persona, no se recrea', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      await failCancel(id);
      change(id, { status: 'new' });
      await one.sync.reconcileWindow();
      // Queda provisional: no cuenta como nuestra.
      expect(
        await dataSource.query(
          'SELECT 1 FROM "cleaning_sync_cancellation" WHERE confirmed',
        ),
      ).toEqual([]);

      cancelByHand(only(id)._id);
      await one.sync.reconcileWindow();

      only(id);
    });

    it('lo mismo si el proceso se reinicia entre medias', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      await failCancel(id);
      change(id, { status: 'new' });
      await two.sync.reconcileReservation(id);

      cancelByHand(only(id)._id);
      await two.sync.reconcileReservation(id);

      only(id);
    });

    it('cancelación fallida y una persona la cancela antes de reintentar: no se recrea', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      await failCancel(id);
      cancelByHand(only(id)._id);
      await one.sync.reconcileReservation(id);

      change(id, { status: 'new' });
      await one.sync.reconcileReservation(id);

      only(id);
    });

    it('una persona la cancela mientras la sincronización iba a hacerlo: no se recrea', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const { _id } = only(id);
      change(id, { status: 'cancelled' });
      const readCard = gateway().getTaskByIdWithSession.getMockImplementation();
      gateway().getTaskByIdWithSession.mockImplementationOnce(
        (taskId: number) => {
          cancelByHand(_id);
          return readCard?.(taskId) as unknown;
        },
      );
      await one.sync.reconcileReservation(id);
      expect(updates()).toEqual([]);

      change(id, { status: 'new' });
      await one.sync.reconcileReservation(id);

      only(id);
    });

    it('una reserva cancelada sin limpieza no crea nada', async () => {
      const id = reserve({ status: 'cancelled' });

      expect(await one.sync.reconcileReservation(id)).toBe('unchanged');

      expect(store.byReservation(id)).toEqual([]);
    });
  });

  describe('ante un fallo no decide', () => {
    it('no se puede leer lo existente: no crea', async () => {
      const id = reserve();
      for (const method of [
        'findTasksByReservation',
        'findHostawayTasksByCheckout',
        'taskExistsByReservationId',
      ] as const) {
        store.attach(gateway());
        gateway()[method].mockRejectedValue(upstreamError(500));

        const result = await one.sync
          .reconcileWindow()
          .catch(() => ({ created: 0 }));
        expect(result.created).toBe(0);
        if (method !== 'findHostawayTasksByCheckout') {
          await expect(one.sync.reconcileReservation(id)).rejects.toThrow();
        }
      }
      expect(created()).toEqual([]);

      // Al recuperarse, la siguiente pasada la crea.
      store.attach(gateway());
      expect(await one.sync.reconcileWindow()).toMatchObject({ created: 1 });
    });

    it('el botón tampoco crea si no puede comprobar lo existente', async () => {
      gateway().taskExistsByReservationId.mockRejectedValue(upstreamError(500));

      await request(one.app.getHttpServer())
        .post('/cleaning-tasks')
        .send({
          hostawayReservationId: 'R-950',
          listingName: 'Suite Azul',
          listingId: '331',
          checkoutDate: today,
          checkoutTime: '11:00',
        })
        .expect(500);

      expect(created()).toEqual([]);
    });

    it('un fallo de una reserva no detiene a las demás', async () => {
      const bad = reserve();
      const good = reserve();
      gateway().findTasksByReservation.mockImplementation((id: string) =>
        id === bad
          ? Promise.reject(upstreamError(500))
          : Promise.resolve(store.byReservation(id)),
      );

      expect(await one.sync.reconcileWindow()).toMatchObject({
        created: 1,
        failed: 1,
      });
      only(good);
      expect(store.byReservation(bad)).toEqual([]);
    });

    it('Hostaway falla o no concluye: no cancela', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      const row = reservations.get(id) as Reservation;

      // El listado cae.
      hostaway().getCheckouts.mockRejectedValueOnce(new Error('caído'));
      await expect(one.sync.reconcileWindow()).rejects.toThrow();
      // El listado llega vacío y el estado no se puede leer.
      hostaway().getCheckouts.mockResolvedValue({ result: [] });
      hostaway().getReservationState.mockRejectedValue(new Error('caído'));
      expect(await one.sync.reconcileWindow()).toMatchObject({
        cancelled: 0,
        failed: 1,
      });
      await expect(one.sync.reconcileReservation(id)).rejects.toThrow();
      // 404, y estados que no son una cancelación explícita.
      attachHostaway(one);
      hostaway().getCheckouts.mockResolvedValue({ result: [] });
      reservations.delete(id);
      expect(await one.sync.reconcileWindow()).toMatchObject({ skipped: 1 });
      for (const status of ['inquiry', 'pending', 'ownerstay', '', 'raro']) {
        reservations.set(id, { ...row, status });
        expect(await one.sync.reconcileReservation(id)).toBe('skipped');
      }
      // Sigue activa aunque el listado la omita.
      reservations.set(id, row);
      expect(await one.sync.reconcileWindow()).toMatchObject({ unchanged: 1 });

      expect(updates()).toEqual([]);
      expect(await marks()).toEqual([]);
      expect(only(id)._phase_description).toBe('Assigned');
    });

    it('sin poder leer las unidades no cambia de alojamiento', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      gateway().listUnitsWithListingOrThrow.mockRejectedValue(
        upstreamError(500),
      );
      change(id, { listingId: '332' });

      await expect(one.sync.reconcileReservation(id)).rejects.toThrow();

      expect(updates()).toEqual([]);
      expect(only(id).HostawayListingID).toBe('331');

      // Se reintenta en la siguiente pasada.
      gateway().listUnitsWithListingOrThrow.mockResolvedValue([]);
      expect(await one.sync.reconcileReservation(id)).toBe('updated');
    });

    it('si falla la escritura de la fecha, la siguiente pasada la reintenta', async () => {
      const id = reserve();
      await one.sync.reconcileWindow();
      change(id, { checkoutDate: tomorrow });
      gateway().updateCleaningTask.mockRejectedValueOnce(upstreamError(500));

      await expect(one.sync.reconcileReservation(id)).rejects.toThrow();
      expect(await one.sync.reconcileReservation(id)).toBe('updated');

      expect(only(id).CheckoutDate).toBe(tomorrow);
    });
  });

  describe('POST /webhooks/hostaway', () => {
    const SIGNAL_DELAY_MS = 5000;
    const realSetTimeout = global.setTimeout;
    let upsert: jest.SpyInstance;
    let signalDelays: number;

    const send = (body: object) =>
      request(one.app.getHttpServer())
        .post('/webhooks/hostaway')
        .set(
          'Authorization',
          `Basic ${Buffer.from('test-hostaway:test-hostaway-secret').toString('base64')}`,
        )
        .send(body);

    const event = (
      data: Record<string, unknown>,
      envelope: Record<string, unknown> = {},
    ) => ({
      object: 'reservation',
      event: 'reservation.updated',
      accountId: 149703,
      ...envelope,
      data: {
        listingMapId: 331,
        guestName: 'Ana Pérez',
        arrivalDate: addDays(today, -2),
        departureDate: today,
        status: 'new',
        ...data,
      },
    });

    const enable = () => {
      process.env.HOSTAWAY_SCHEDULER_ENABLED = 'true';
    };

    beforeEach(() => {
      // Sin estancias reales: otras suites vacían esas tablas en paralelo.
      upsert = jest
        .spyOn(one.app.get(GuestStayService), 'upsertFromReservation')
        .mockResolvedValue({ id: 'estancia' } as never);

      // La espera de la señal, de 5 s a 20 ms.
      signalDelays = 0;
      jest.spyOn(global, 'setTimeout').mockImplementation(((
        handler: () => void,
        ms?: number,
        ...args: never[]
      ) => {
        const isSignal = ms === SIGNAL_DELAY_MS;
        if (isSignal) signalDelays += 1;
        return realSetTimeout(handler, isSignal ? 20 : ms, ...args);
      }) as never);
    });

    afterEach(async () => {
      process.env.HOSTAWAY_SCHEDULER_ENABLED = 'false';
      // Que ninguna señal termine dentro de la prueba siguiente.
      await pause(60);
      jest.mocked(global.setTimeout).mockRestore();
      upsert.mockRestore();
    });

    it('con el flag apagado no dispara nada', async () => {
      const id = reserve();

      const res = await send(event({ id: Number(id) })).expect(200);
      await pause(100);

      expect(res.body).toEqual({ received: true, processed: true });
      expect(signalDelays).toBe(0);
      expect(hostaway().getReservationState).not.toHaveBeenCalled();
      expect(gateway().findTasksByReservation).not.toHaveBeenCalled();
      expect(created()).toEqual([]);
    });

    it('con el flag encendido termina reconciliando', async () => {
      enable();
      const id = reserve();

      await send(
        event({ id: Number(id) }, { event: 'reservation.created' }),
      ).expect(200);
      await until(() => store.byReservation(id).length === 1);
      expect(hostaway().getReservationState).toHaveBeenCalledWith(id);

      // El evento trae un estado viejo: manda lo que Hostaway dice ahora.
      change(id, { status: 'cancelled' });
      await send(event({ id: Number(id), status: 'new' })).expect(200);
      await until(() => only(id)._phase_description === 'Cancelled');
    });

    it('usa hostawayReservationId y no el id del canal', async () => {
      enable();
      const id = reserve();

      await send(
        event({
          id: 1,
          hostawayReservationId: id,
          reservationId: '288172-guest-1',
        }),
      ).expect(200);

      await until(() => store.byReservation(id).length === 1);
      expect(hostaway().getReservationState.mock.calls).toEqual([[id]]);
    });

    it('una ráfaga de la misma reserva se atiende una vez', async () => {
      enable();
      const id = reserve();

      for (let i = 0; i < 3; i += 1) one.sync.signal(id);
      await until(() => store.byReservation(id).length === 1);
      await pause(60);

      expect(hostaway().getReservationState).toHaveBeenCalledTimes(1);
      only(id);
    });

    it('fuera de la ventana no crea', async () => {
      enable();
      const id = reserve({ checkoutDate: addDays(today, 5) });

      await send(event({ id: Number(id) })).expect(200);
      await until(() => hostaway().getReservationState.mock.calls.length === 1);
      await pause(60);

      expect(created()).toEqual([]);
    });

    it('sin fechas en el evento, la limpieza se atiende igual', async () => {
      enable();
      const id = reserve();

      const res = await send(
        event({ id: Number(id), arrivalDate: null, departureDate: null }),
      ).expect(200);

      expect(res.body).toEqual({ received: true, processed: false });
      await until(() => store.byReservation(id).length === 1);
    });

    it('un fallo al reconciliar ni se ve en la respuesta ni frena a la siguiente', async () => {
      enable();
      const bad = reserve();
      const good = reserve();
      hostaway().getReservationState.mockRejectedValueOnce(new Error('caído'));

      await send(event({ id: Number(bad) })).expect(200);
      await send(event({ id: Number(good) })).expect(200);

      await until(() => store.byReservation(good).length === 1);
      expect(store.byReservation(bad)).toEqual([]);
    });

    it('responde sin esperar a la reconciliación', async () => {
      enable();
      const id = reserve();
      const slow = (): Promise<unknown> =>
        new Promise((resolve) => {
          release = () => resolve({ kind: 'not_found' });
        });
      let release = () => {};
      hostaway().getReservationState.mockImplementationOnce(slow);

      await send(event({ id: Number(id) })).expect(200);
      await until(() => hostaway().getReservationState.mock.calls.length === 1);
      const res = await send(event({ id: Number(id) })).expect(200);

      expect(res.body).toEqual({ received: true, processed: true });
      release();
    });

    it('la respuesta es idéntica con el flag apagado y encendido', async () => {
      const ask = async () => {
        const answers: unknown[] = [];
        const record = async (body: object) => {
          const res = await send(body);
          answers.push([res.status, res.body]);
        };
        const id = Number(reserve());
        await record(event({ id }));
        await record(event({ id }, { event: 'reservation.created' }));
        await record(event({ id }, { event: 'message.received' }));
        await record(event({ id }, { object: 'conversation' }));
        await record(event({}));
        await record(event({ id, arrivalDate: null }));
        await record(event({ id, arrivalDate: 'no es fecha' }));
        await record({});
        upsert.mockResolvedValueOnce(null);
        await record(event({ id }));
        upsert.mockRejectedValueOnce(new Error('transitorio'));
        await record(event({ id }));
        return answers;
      };

      const off = await ask();
      expect(signalDelays).toBe(0);
      enable();
      const on = await ask();

      expect(signalDelays).toBeGreaterThan(0);
      expect(on).toEqual(off);
      expect(off).toContainEqual([200, { received: true, processed: true }]);
      expect(off).toContainEqual([200, { received: true, processed: false }]);
    });
  });
});
