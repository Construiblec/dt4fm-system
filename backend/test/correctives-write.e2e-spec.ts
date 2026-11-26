import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { CM_ACTIONS } from '../src/modules/maintenance-supervision/constants/corrective-maint.constants';
import { CleaningTasksSessionService } from '../src/modules/cleaning-tasks/cleaning-tasks.session.service';
import { MaintenanceStore, upstreamError } from './helpers/maintenance-store';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { MOCK_SESSION_ID } from './mocks/openmaint-core.mock';

const API = '/integrations/v1/correctives';
const READ_KEY = 'e2e-clave-mantenimiento-0123456789abcd';
const BACK_VARIABLE = 'OPENMAINT_CM_BACK_TO_ASSIGNMENT_ACTION_ID';
const BACK_ACTION = 777001;

/** Un cliente por bloque: el cupo de escritura es de 20/min. */
const writeKey = (client: string) =>
  `e2e-escritura-${client}-0123456789abcdefghij`;

const START = '2026-11-26T15:00:00.000Z';
const OTHER = '2026-11-27T15:00:00.000Z';
const LOCAL_OTHER = '2026-11-27T10:00:00-05:00';
const STARTED = '2026-11-26T15:05:00.000Z';

const like = (value: object) => expect.objectContaining(value) as unknown;

describe('API de correctivos: escritura (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let store: MaintenanceStore;
  let client = 'cm-acceso';
  let responses: Response[] = [];
  let getSessionId: jest.SpyInstance;
  let isCoolingDown: jest.SpyInstance;

  const call = async (
    method: 'get' | 'patch' | 'post' | 'put' | 'delete',
    path: string,
    body?: unknown,
    key: string | null = writeKey(client),
  ): Promise<Response> => {
    const test = request(app.getHttpServer())[method](path);
    if (key !== null) void test.set('x-api-key', key);
    const res = await (body === undefined ? test : test.send(body as object));
    responses.push(res);
    return res;
  };

  const patch = (body: unknown, id: number | string) =>
    call('patch', `${API}/${id}`, body);
  const cancel = (body: unknown, id: number | string) =>
    call('post', `${API}/${id}/cancel`, body);
  const plans = (body: unknown) => call('post', `${API}/plans`, body);
  const read = (id: number) => call('get', `${API}/${id}`, undefined, READ_KEY);

  const gateway = () => mocks.correctiveOpenmaint;
  const noWrites = () => {
    expect(gateway().advance).not.toHaveBeenCalled();
    expect(gateway().saveFields).not.toHaveBeenCalled();
    expect(store.cmAdvances).toEqual([]);
    expect(store.cmSaves).toEqual([]);
  };
  const noPush = () => {
    expect(mocks.pushDispatch.notifyCorrectiveAssigned).not.toHaveBeenCalled();
    expect(
      mocks.pushDispatch.notifyMaintenancePlanUpdated,
    ).not.toHaveBeenCalled();
  };
  const actions = () => store.cmAdvances.map(({ action }) => action);

  /** Con la acción de vuelta a asignación configurada o no. */
  const setBack = (id: number | null) => {
    store.backAction = id;
    process.env[BACK_VARIABLE] = id === null ? '' : String(id);
  };

  const put = (status: string, overrides: Record<string, unknown> = {}) =>
    store.corrective(status, {
      Team: 501,
      Category: 1,
      _Category_description: 'MNT - Mantenimiento',
      Subcategory: 11,
      _Subcategory_description: 'MNT - Sistema de agua caliente',
      ShortDescr: 'Sistema de agua caliente',
      ExpExecStartDate: START,
      Unit: 5,
      _Unit_description: 'Depto 402',
      ...overrides,
    });
  /** Execution sin inicio real: el estado público «Assigned». */
  const assigned = (overrides: Record<string, unknown> = {}) =>
    put('Execution', { Assignee: 8, ExecStartDate: null, ...overrides });
  const useClient = (name: string) =>
    beforeEach(() => {
      client = name;
    });

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    const session = app.get(CleaningTasksSessionService);
    getSessionId = jest.spyOn(session, 'getSessionId');
    isCoolingDown = jest.spyOn(session, 'isCoolingDown');
  });

  beforeEach(() => {
    resetMockCalls();
    responses = [];
    getSessionId.mockReset().mockResolvedValue(MOCK_SESSION_ID);
    isCoolingDown.mockReset().mockReturnValue(false);

    store = new MaintenanceStore();
    store.employees = [
      { _id: 7, Description: 'Luis Pérez', Team: 501 },
      { _id: 8, Description: 'Ana Ruiz', Team: 501 },
      {
        _id: 9,
        Description: 'Proveedor SA',
        Team: 501,
        _type: 'SupplierEmployee',
      },
      { _id: 10, Description: 'De limpieza', Team: 999 },
      { _id: 12, Description: 'Pedro Gil', Team: 502 },
    ];
    store.install(mocks);
    setBack(null);
  });

  // Ninguna respuesta nombra la fuente y toda ruta de la API es privada.
  afterEach(() => {
    for (const { body, text, headers } of responses) {
      expect(text).not.toMatch(/openmaint|cmdbuild/i);
      expect(JSON.stringify(body)).not.toMatch(/openmaint|cmdbuild/i);
      if (headers['cache-control'] !== undefined) {
        expect(headers['cache-control']).toBe('private, no-store');
      }
    }
    for (const method of Object.values(mocks.openmaintClient)) {
      expect(method).not.toHaveBeenCalled();
    }
    // Los preventivos no se tocan desde esta ruta.
    for (const method of ['advance', 'saveFields'] as const) {
      expect(mocks.preventiveOpenmaint[method]).not.toHaveBeenCalled();
    }
    // Todo lo que pide categorías usa la sesión de servicio compartida.
    for (const [, , sessionId] of mocks.maintCategories.resolve.mock
      .calls as unknown as [number, number, string][]) {
      expect(sessionId).toBe(MOCK_SESSION_ID);
    }
  });

  afterAll(async () => {
    delete process.env[BACK_VARIABLE];
    await app?.close();
  });

  describe('acceso', () => {
    useClient('cm-acceso');

    const ROUTES = [
      ['patch', `${API}/7`, { employeeId: 7 }],
      ['post', `${API}/7/cancel`, { reason: 'x' }],
      ['post', `${API}/plans`, { changes: [{ id: 7, employeeId: 7 }] }],
    ] as const;

    it.each(ROUTES)('401 sin clave válida: %s %s', async (m, path, body) => {
      for (const key of [null, 'x'.repeat(40)]) {
        const res = await call(m, path, body, key);
        expect(res.status).toBe(401);
      }
      noWrites();
    });

    it.each(ROUTES)(
      '403 con clave de lectura: %s %s',
      async (m, path, body) => {
        expect((await call(m, path, body, READ_KEY)).status).toBe(403);
        noWrites();
      },
    );

    it('503 en enfriamiento o sin sesión, sin llamar a la fuente', async () => {
      const card = put('Assignment');
      isCoolingDown.mockReturnValue(true);
      expect((await patch({ priority: 'Low' }, card._id)).status).toBe(503);
      expect((await cancel({ reason: 'x' }, card._id)).status).toBe(503);

      isCoolingDown.mockReturnValue(false);
      getSessionId.mockResolvedValue('');
      expect((await patch({ priority: 'Low' }, card._id)).status).toBe(503);

      expect(gateway().findWithTasklist).not.toHaveBeenCalled();
      noWrites();
    });
  });

  describe('despacho desde Assignment', () => {
    useClient('cm-despacho');

    it('avanza con la tarjeta fusionada, borra el inicio autocopiado y avisa al técnico', async () => {
      const card = put('Assignment');

      const res = await patch({ employeeId: 7, notes: ' Urgente ' }, card._id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: [],
        data: {
          kind: 'corrective',
          id: card._id,
          status: 'Assigned',
          actualStartTime: null,
          assignee: { id: 7, name: 'Luis Pérez' },
        },
      });
      expect(store.cmAdvances).toEqual([
        {
          id: card._id,
          action: CM_ACTIONS.ASSIGN,
          notes: '[API · cm-despacho] Urgente',
          fields: {
            Assignee: 7,
            Priority: 118,
            Category: 1,
            Subcategory: 11,
            ShortDescr: 'Sistema de agua caliente',
            Team: 501,
          },
        },
      ]);
      expect(store.cmSaves).toEqual([
        { id: card._id, fields: { ExecStartDate: null } },
      ]);
      expect(store.correctives.get(card._id)!.ExecStartDate).toBeNull();
      expect(mocks.maintCategories.resolve).toHaveBeenCalledWith(
        1,
        11,
        MOCK_SESSION_ID,
      );
      expect(mocks.pushDispatch.notifyCorrectiveAssigned).toHaveBeenCalledTimes(
        1,
      );
      expect(mocks.pushDispatch.notifyCorrectiveAssigned).toHaveBeenCalledWith({
        id: card._id,
        assigneeId: 7,
        unitName: 'Depto 402',
        floorName: undefined,
        buildingName: 'Pradera',
      });
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).not.toHaveBeenCalled();
    });

    it('fusiona los campos del cambio: fecha, prioridad, categoría, título y equipo', async () => {
      const card = put('Assignment', { Team: null, ExpExecStartDate: null });

      const res = await patch(
        {
          employeeId: 12,
          teamId: 502,
          plannedStartTime: LOCAL_OTHER,
          priority: 'Critical',
          categoryId: 1,
          subcategoryId: 19,
          otherDescription: ' Puerta atascada ',
        },
        card._id,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: [],
        data: {
          status: 'Assigned',
          title: 'Puerta atascada',
          plannedStartTime: OTHER,
          priority: { code: 'Critical' },
          team: { id: 502 },
          subcategory: { id: 19 },
        },
      });
      expect(store.cmAdvances[0].fields).toEqual({
        Assignee: 12,
        Priority: 117,
        Category: 1,
        Subcategory: 19,
        ShortDescr: 'Puerta atascada',
        Team: 502,
        ExpExecStartDate: OTHER,
      });
    });

    it('sin equipo en la tarjeta ni en el cambio escribe el del técnico', async () => {
      const card = put('Assignment', { Team: null });

      await patch({ employeeId: 7 }, card._id);

      expect(store.cmAdvances[0].fields.Team).toBe(501);
    });

    it('repetir con el mismo técnico tras un CM05-Back despacha otra vez', async () => {
      const card = put('Assignment', { Assignee: 7 });

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        data: { status: 'Assigned' },
      });
      expect(actions()).toEqual([CM_ACTIONS.ASSIGN]);
      expect(mocks.pushDispatch.notifyCorrectiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('faltando fecha, prioridad o categoría: 400 con lo que falta y sin escribir', async () => {
      const card = put('Assignment', {
        ExpExecStartDate: null,
        Priority: null,
        Category: null,
        Subcategory: null,
      });

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toBe(
        'Faltan: plannedStartTime, priority, categoryId',
      );
      noWrites();
      noPush();
    });

    it('«Otro» sin título usable es 400; una subcategoría ajena, 400', async () => {
      const card = put('Assignment');

      expect(
        (await patch({ categoryId: 1, subcategoryId: 19 }, card._id)).status,
      ).toBe(400);
      expect(
        (await patch({ categoryId: 1, subcategoryId: 21 }, card._id)).status,
      ).toBe(400);
      noWrites();
    });

    it('técnico inválido: 404, 400, 409 y de otro equipo, sin escribir', async () => {
      const card = put('Assignment');

      expect((await patch({ employeeId: 7 }, card._id + 1000)).status).toBe(
        404,
      );
      expect((await patch({ employeeId: 99 }, card._id)).status).toBe(400);
      expect((await patch({ employeeId: 10 }, card._id)).status).toBe(400);
      expect((await patch({ employeeId: 9 }, card._id)).status).toBe(409);
      // Del equipo 502 con la tarjeta en el 501.
      expect((await patch({ employeeId: 12 }, card._id)).status).toBe(409);
      expect((await patch({ teamId: 999 }, card._id)).status).toBe(400);

      noWrites();
      noPush();
    });
  });

  describe('despacho: guardados y formatos', () => {
    useClient('cm-campos');

    it('sin técnico guarda la tarjeta; con uno puesto avisa not_dispatched', async () => {
      const card = put('Assignment', { Assignee: 7 });

      const res = await patch(
        { plannedStartTime: OTHER, priority: 'Low' },
        card._id,
      );

      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: ['not_dispatched'],
        data: {
          status: 'Assignment',
          plannedStartTime: OTHER,
          priority: { code: 'Low' },
        },
      });
      expect(store.cmAdvances).toEqual([]);
      noPush();

      const again = await patch({ plannedStartTime: OTHER }, card._id);
      expect(again.body).toMatchObject({ result: 'unchanged' });
    });

    it('si la fuente descarta la prioridad: aplicado con aviso field_not_saved', async () => {
      const card = put('Assignment');
      store.discard = ['Priority'];

      const res = await patch({ employeeId: 7, priority: 'Low' }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: ['field_not_saved'],
        data: { priority: { code: 'High' } },
      });
    });

    it('si falla borrar el inicio real: aplicado con aviso y el técnico sí recibe el aviso', async () => {
      const card = put('Assignment');
      mocks.correctiveOpenmaint.saveFields.mockRejectedValue(
        upstreamError(500),
      );

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: ['exec_start_not_restored'],
        data: { status: 'Execution', actualStartTime: START },
      });
      expect(mocks.pushDispatch.notifyCorrectiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('rechaza formatos inválidos y la query, sin escribir', async () => {
      const card = put('Assignment');

      expect(
        (await patch({ employeeId: 7 }, `${card._id}?dryRun=true`)).status,
      ).toBe(400);
      for (const body of [
        {},
        { notes: 'solo notas' },
        { priority: 'Urgent' },
        { categoryId: 1 },
        { employeeId: '7' },
        { otherDescription: 'x'.repeat(81) },
        { employeeId: 7, status: 'Assigned' },
      ]) {
        expect((await patch(body, card._id)).status).toBe(400);
      }

      noWrites();
      expect(gateway().findWithTasklist).not.toHaveBeenCalled();
    });

    it('vacía la caché de lecturas', async () => {
      const card = put('Assignment');
      expect((await read(card._id)).body.data.assignee).toBeNull();

      await patch({ employeeId: 7 }, card._id);

      expect((await read(card._id)).body.data.assignee).toMatchObject({
        id: 7,
      });
    });
  });

  describe('según el estado', () => {
    useClient('cm-estados');

    it('Assigned: el técnico del mismo equipo va por CM03-Return, borra el inicio y avisa a ambos', async () => {
      const card = assigned();

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: [],
        data: {
          status: 'Assigned',
          actualStartTime: null,
          assignee: { id: 7 },
        },
      });
      expect(actions()).toEqual([CM_ACTIONS.CHANGE_ASSIGNEE]);
      expect(store.cmSaves).toEqual([
        { id: card._id, fields: { ExecStartDate: null } },
      ]);
      expect(mocks.pushDispatch.notifyCorrectiveAssigned).toHaveBeenCalledWith(
        like({ id: card._id, assigneeId: 7 }),
      );
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).toHaveBeenCalledWith(
        like({
          kind: 'corrective',
          id: card._id,
          employeeId: 8,
          change: 'removed',
        }),
      );
    });

    it('Assigned: un técnico de otro equipo es 409 y el mismo técnico, unchanged', async () => {
      const card = assigned();

      expect((await patch({ employeeId: 12 }, card._id)).status).toBe(409);
      const same = await patch({ employeeId: 8 }, card._id);

      expect(same.body).toMatchObject({ result: 'unchanged', warnings: [] });
      noWrites();
      noPush();
    });

    it('Assigned sin la acción nueva: reprogramar es 409 y no se escribe nada', async () => {
      const card = assigned();

      for (const body of [
        { plannedStartTime: OTHER },
        { priority: 'Low' },
        { categoryId: 1, subcategoryId: 19, otherDescription: 'x' },
        { employeeId: 12, teamId: 502 },
      ]) {
        const res = await patch(body, card._id);
        expect(res.status).toBe(409);
        expect((res.body as { message: string }).message).toBe(
          'Reprogramar un correctivo ya asignado aún no está disponible; solo se puede cambiar el técnico',
        );
      }
      noWrites();
      noPush();
    });

    it('Assigned con la acción nueva: vuelve a asignación, despacha y avisa la nueva fecha', async () => {
      setBack(BACK_ACTION);
      const card = assigned();

      const res = await patch({ plannedStartTime: LOCAL_OTHER }, card._id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        data: {
          status: 'Assigned',
          plannedStartTime: OTHER,
          actualStartTime: null,
          assignee: { id: 8 },
        },
      });
      expect(actions()).toEqual([BACK_ACTION, CM_ACTIONS.ASSIGN]);
      expect(store.cmAdvances[1].fields).toMatchObject({
        Assignee: 8,
        ExpExecStartDate: OTHER,
        Team: 501,
      });
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).toHaveBeenCalledWith(like({ employeeId: 8, change: 'rescheduled' }));
      expect(
        mocks.pushDispatch.notifyCorrectiveAssigned,
      ).not.toHaveBeenCalled();
    });

    it('Assigned con la acción: cambiar de equipo y técnico retira al anterior y avisa al nuevo', async () => {
      setBack(BACK_ACTION);
      const card = assigned();

      const res = await patch({ employeeId: 12, teamId: 502 }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        data: { status: 'Assigned', team: { id: 502 }, assignee: { id: 12 } },
      });
      expect(mocks.pushDispatch.notifyCorrectiveAssigned).toHaveBeenCalledWith(
        like({ assigneeId: 12 }),
      );
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).toHaveBeenCalledWith(like({ employeeId: 8, change: 'removed' }));
    });
  });

  describe('según el estado: empezado y cerrados', () => {
    useClient('cm-reprogramar');

    it('Execution empezado: solo el técnico, restaura el inicio y avisa started', async () => {
      const card = put('Execution', { Assignee: 8, ExecStartDate: STARTED });

      const ok = await patch({ employeeId: 7 }, card._id);

      expect(ok.body).toMatchObject({
        result: 'applied',
        warnings: ['started'],
        data: {
          status: 'Execution',
          actualStartTime: STARTED,
          assignee: { id: 7 },
        },
      });
      expect(store.cmSaves).toEqual([
        { id: card._id, fields: { ExecStartDate: STARTED } },
      ]);
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).toHaveBeenCalledWith(like({ employeeId: 8, change: 'removed' }));

      const other = await patch({ plannedStartTime: OTHER }, card._id);
      expect(other.status).toBe(409);
      expect((other.body as { message: string }).message).toBe(
        'El correctivo ya empezó: solo se puede cambiar el técnico',
      );
      expect(actions()).toEqual([CM_ACTIONS.CHANGE_ASSIGNEE]);
    });

    it('Management: técnico y equipo con un guardado; otro campo, 409', async () => {
      const card = put('Management', { Assignee: 8 });

      const ok = await patch({ employeeId: 12, teamId: 502 }, card._id);
      expect(ok.body).toMatchObject({
        result: 'applied',
        data: { status: 'Management', assignee: { id: 12 }, team: { id: 502 } },
      });
      expect(store.cmAdvances).toEqual([]);

      expect((await patch({ priority: 'Low' }, card._id)).status).toBe(409);
    });

    it('Accounting: unchanged con pending_review; con cambio, 409', async () => {
      const card = put('Accounting', { Assignee: 8 });

      const same = await patch({ employeeId: 8 }, card._id);
      expect(same.body).toMatchObject({
        result: 'unchanged',
        warnings: ['pending_review'],
      });
      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(409);
      noWrites();
    });

    it.each(['Completed', 'Canceled'])(
      '%s: unchanged con closed; con cambio, 409',
      async (status) => {
        const card = put(status, { Assignee: 8 });

        const same = await patch({ employeeId: 8 }, card._id);
        expect(same.body).toMatchObject({
          result: 'unchanged',
          warnings: ['closed'],
        });
        expect((await patch({ priority: 'Low' }, card._id)).status).toBe(409);
        noWrites();
      },
    );

    it('Estimate: 409', async () => {
      const card = put('Estimate');

      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(409);
      noWrites();
    });

    it('un guardado con notas avisa notes_not_saved', async () => {
      const card = put('Assignment');

      const res = await patch({ priority: 'Low', notes: 'Nota' }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: ['notes_not_saved'],
      });
    });
  });

  describe('cancelar', () => {
    useClient('cm-cancelar');

    it('en asignación: CM02-Reject con el motivo, sin avisar a un técnico sin despachar', async () => {
      const card = put('Assignment', { Assignee: 7 });

      const res = await cancel({ reason: '  Duplicado ' }, card._id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        data: { status: 'Canceled', isClosed: true },
      });
      expect(store.cmAdvances).toEqual([
        {
          id: card._id,
          action: CM_ACTIONS.REJECT_AND_CLOSE,
          notes: '[API · cm-cancelar] Duplicado',
          fields: {},
        },
      ]);
      // Sin despachar, el técnico nunca supo de la orden.
      noPush();
    });

    it('asignado sin empezar y sin la acción nueva: 409', async () => {
      const card = assigned();

      const res = await cancel({ reason: 'x' }, card._id);

      expect(res.status).toBe(409);
      noWrites();
      noPush();
    });

    it('asignado sin empezar con la acción nueva: vuelve a asignación y cancela', async () => {
      setBack(BACK_ACTION);
      const card = assigned();

      const res = await cancel({ reason: 'Ya no hace falta' }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        data: { status: 'Canceled' },
      });
      expect(actions()).toEqual([BACK_ACTION, CM_ACTIONS.REJECT_AND_CLOSE]);
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.pushDispatch.notifyMaintenancePlanUpdated,
      ).toHaveBeenCalledWith(like({ employeeId: 8, change: 'cancelled' }));
    });

    it('ya cancelado: unchanged; empezado, en gestión o cerrado: 409', async () => {
      const done = put('Canceled');
      const same = await cancel({ reason: 'x' }, done._id);
      expect(same.body).toMatchObject({
        result: 'unchanged',
        warnings: ['closed'],
      });

      for (const card of [
        put('Execution', { Assignee: 8, ExecStartDate: STARTED }),
        put('Management'),
        put('Completed'),
        put('Accounting'),
      ]) {
        expect((await cancel({ reason: 'x' }, card._id)).status).toBe(409);
      }
      noWrites();
      noPush();
    });

    it('rechaza cuerpos inválidos y un id inexistente', async () => {
      const card = put('Assignment');

      for (const body of [{}, { reason: '' }, { reason: 'x'.repeat(501) }]) {
        expect((await cancel(body, card._id)).status).toBe(400);
      }
      expect((await cancel({ reason: 'x' }, card._id + 1000)).status).toBe(404);
      noWrites();
    });
  });

  describe('lotes', () => {
    useClient('cm-lotes');

    it('con dryRun valida sin escribir ni avisar', async () => {
      const ok = put('Assignment');
      const incomplete = put('Assignment', { Priority: null });
      const closed = put('Completed');

      const res = await plans({
        dryRun: true,
        changes: [
          { id: ok._id, employeeId: 7 },
          { id: incomplete._id, employeeId: 7 },
          { id: closed._id, priority: 'Low' },
          { id: ok._id + 5000, employeeId: 7 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        dryRun: true,
        summary: { valid: 1, failed: 3, applied: 0 },
      });
      expect(
        res.body.results.map((r: any) => r.error?.statusCode ?? null),
      ).toEqual([null, 400, 409, 404]);
      noWrites();
      noPush();
    });

    it('aplica por separado: lo válido se guarda aunque otro falle', async () => {
      const good = put('Assignment');
      const bad = put('Assignment', { ExpExecStartDate: null });

      const res = await plans({
        changes: [
          { id: good._id, employeeId: 7 },
          { id: bad._id, employeeId: 8 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ applied: 1, failed: 1 });
      expect(store.correctives.get(good._id)!.Assignee).toBe(7);
      expect(store.correctives.get(bad._id)!.Assignee).toBeUndefined();
      expect(mocks.pushDispatch.notifyCorrectiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('un error de formato es 400 y no guarda nada', async () => {
      const card = put('Assignment');

      const res = await plans({
        changes: [
          { id: card._id, employeeId: 7 },
          { id: card._id + 1, categoryId: 1 },
        ],
      });

      expect(res.status).toBe(400);
      expect(gateway().findWithTasklist).not.toHaveBeenCalled();
      noWrites();
    });
  });

  describe('fallos de la fuente', () => {
    useClient('cm-fallos');

    it('si el segundo paso falla tras volver a asignación: 502 «quedó por asignar»', async () => {
      setBack(BACK_ACTION);
      const card = assigned();
      const advance = gateway().advance.getMockImplementation()!;
      gateway().advance.mockImplementationOnce(advance);
      gateway().advance.mockRejectedValueOnce(upstreamError(500));

      const res = await patch({ plannedStartTime: OTHER }, card._id);

      expect(res.status).toBe(502);
      expect((res.body as { message: string }).message).toBe(
        'El correctivo quedó por asignar sin aplicar el cambio; comprobar antes de repetir',
      );
      expect((await read(card._id)).body.data).toMatchObject({
        status: 'Assignment',
        assignee: { id: 8 },
      });
      noPush();
    });

    it('si el rechazo falla tras volver a asignación: 502 «quedó por asignar sin cancelar»', async () => {
      setBack(BACK_ACTION);
      const card = assigned();
      const advance = gateway().advance.getMockImplementation()!;
      gateway().advance.mockImplementationOnce(advance);
      gateway().advance.mockRejectedValueOnce(upstreamError(500));

      const res = await cancel({ reason: 'x' }, card._id);

      expect(res.status).toBe(502);
      expect((res.body as { message: string }).message).toBe(
        'El correctivo quedó por asignar sin cancelar; repetir lo cancela',
      );
      noPush();

      // Repetir lo cancela.
      const again = await cancel({ reason: 'x' }, card._id);
      expect(again.body).toMatchObject({
        result: 'applied',
        data: { status: 'Canceled' },
      });
    });

    it('un avance que falla sin guardarse es 502 y no avisa', async () => {
      const card = put('Assignment');
      gateway().advance.mockRejectedValue(upstreamError(500));

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(502);
      expect(store.correctives.get(card._id)!.Assignee).toBeUndefined();
      noPush();
    });

    it('la actividad gastada es 409', async () => {
      const card = put('Assignment');
      const find = gateway().findWithTasklist.getMockImplementation()!;
      gateway().findWithTasklist.mockImplementationOnce(async (...args) => {
        const found = (await find(...args)) as {
          data: { _tasklist: { _id: string }[] };
        };
        found.data._tasklist = [{ _id: 'act-vieja' }];
        return found;
      });
      gateway().findWithTasklist.mockImplementation(find);

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(409);
    });

    it('un fallo del aviso push no cambia el resultado', async () => {
      const card = put('Assignment');
      mocks.pushDispatch.notifyCorrectiveAssigned.mockRejectedValue(
        new Error('push caído'),
      );

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('applied');
    });
  });
});
