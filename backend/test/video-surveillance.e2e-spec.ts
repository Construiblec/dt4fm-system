import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession, MOCK_SESSION_ID } from './mocks/openmaint-core.mock';
import { DEFAULT_CAMERAS, ING_BUILDING_ID } from './mocks/gateways.mock';
import { LiveViewRequest } from '../src/modules/video-surveillance/entities/live-view-request.entity';

const CAV_SESSION = { authorization: MOCK_SESSION_ID };

/**
 * Persistencia real contra Postgres, VPS doblada. Lo que se prueba es que cada
 * sesión deja su registro y que el ticket no acaba en ningún sitio.
 */
describe('CamerasController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let dataSource: DataSource;

  const registros = () =>
    dataSource
      .getRepository(LiveViewRequest)
      .find({ order: { requestedAt: 'DESC' } });

  const pedirSesion = (cameraId: string, requestId: string = randomUUID()) =>
    request(app.getHttpServer())
      .post(`/cameras/${cameraId}/live-sessions`)
      .set(CAV_SESSION)
      .send({ requestId });

  const comoRol = (role: string, username = 'cav.mock') =>
    mocks.openmaint.getSession.mockResolvedValue(
      mockSession({ role, username }),
    );

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE "live_view_request"');
    resetMockCalls();
    mocks.accessIot.listCameras.mockResolvedValue(DEFAULT_CAMERAS);
    comoRol('SupervisorCAV');
  });

  describe('GET /cameras', () => {
    it('sin sesión es 401 y sin rol de CAV, 403', async () => {
      await request(app.getHttpServer()).get('/cameras').expect(401);

      comoRol('MaintOffice');
      await request(app.getHttpServer())
        .get('/cameras')
        .set(CAV_SESSION)
        .expect(403);
    });

    it('agrupa las cámaras por edificio', async () => {
      const res = await request(app.getHttpServer())
        .get('/cameras')
        .set(CAV_SESSION)
        .expect(200);

      expect(res.body.data).toEqual({
        enabled: true,
        stale: false,
        buildings: [
          {
            buildingId: ING_BUILDING_ID,
            name: 'Inglaterra',
            reachable: true,
            cameras: [
              { cameraId: 'ING-CAM-01', name: 'Acceso vehicular' },
              { cameraId: 'ING-CAM-02', name: 'Lobby' },
            ],
          },
        ],
      });
    });
  });

  describe('POST /cameras/:cameraId/live-sessions', () => {
    it('registra la visualización y entrega la sesión sin guardarla', async () => {
      const requestId = randomUUID();

      const res = await pedirSesion('ING-CAM-01', requestId).expect(201);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.data).toMatchObject({
        requestId,
        cameraId: 'ING-CAM-01',
        ticket: 'TICKET-SECRETO',
        iceTransportPolicy: 'relay',
      });
      expect(mocks.accessIot.createLiveSession).toHaveBeenCalledWith(
        'ING-CAM-01',
        { requestId },
      );

      const filas = await registros();

      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        requestId,
        cameraId: 'ING-CAM-01',
        buildingId: ING_BUILDING_ID,
        actorUsername: 'cav.mock',
        status: 'issued',
        errorCode: null,
      });
      expect(filas[0].finishedAt).not.toBeNull();
      expect(JSON.stringify(filas)).not.toMatch(/TICKET-SECRETO|TURN-SECRETO/);
    });

    it('normaliza el requestId a minúsculas', async () => {
      const requestId = randomUUID();

      await pedirSesion('ING-CAM-01', requestId.toUpperCase()).expect(201);

      expect((await registros())[0].requestId).toBe(requestId);
    });

    it('un requestId ya usado es 409 y no pide otra sesión', async () => {
      const requestId = randomUUID();

      await pedirSesion('ING-CAM-01', requestId).expect(201);
      const res = await pedirSesion('ING-CAM-01', requestId).expect(409);

      expect(res.body.code).toBe('duplicate_request');
      expect(mocks.accessIot.createLiveSession).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['live_capacity_reached', 503, 'live_capacity_reached'],
      ['gateway_unreachable', 503, 'gateway_unreachable'],
      ['not_found', 404, 'not_found'],
      ['device_ambiguous', 502, 'device_ambiguous'],
      ['unauthorized', 503, 'live_unavailable'],
      ['timeout', 503, 'live_unavailable'],
    ])(
      '%s de la VPS responde %i %s y queda registrado',
      async (errorCode, status, code) => {
        mocks.accessIot.createLiveSession.mockResolvedValueOnce({
          outcome: 'failed',
          errorCode,
        });

        const res = await pedirSesion('ING-CAM-01').expect(status);

        expect(res.body.code).toBe(code);
        expect((await registros())[0]).toMatchObject({
          status: 'failed',
          errorCode,
        });
      },
    );

    it('sin rol de CAV no pide sesión ni registra nada', async () => {
      comoRol('MaintOffice');

      await pedirSesion('ING-CAM-01').expect(403);

      expect(mocks.accessIot.createLiveSession).not.toHaveBeenCalled();
      expect(await registros()).toHaveLength(0);
    });

    it('un cameraId inválido es 400 sin tocar la VPS', async () => {
      await pedirSesion('ING CAM 01').expect(400);

      expect(mocks.accessIot.createLiveSession).not.toHaveBeenCalled();
    });

    it('un requestId que no es UUID es 400', async () => {
      await pedirSesion('ING-CAM-01', 'no-es-uuid').expect(400);
    });

    describe('con el interruptor apagado', () => {
      beforeEach(() => {
        process.env.LIVE_VIDEO_ENABLED = 'false';
      });

      afterEach(() => {
        process.env.LIVE_VIDEO_ENABLED = 'true';
      });

      it('responde 503 live_disabled y lo anuncia en el catálogo', async () => {
        const res = await pedirSesion('ING-CAM-01').expect(503);

        expect(res.body.code).toBe('live_disabled');
        expect(mocks.accessIot.createLiveSession).not.toHaveBeenCalled();

        const catalogo = await request(app.getHttpServer())
          .get('/cameras')
          .set(CAV_SESSION)
          .expect(200);

        expect(catalogo.body.data.enabled).toBe(false);
      });
    });
  });

  describe('GET /cameras/views', () => {
    it('solo SuperUser consulta el historial', async () => {
      await request(app.getHttpServer())
        .get('/cameras/views')
        .set(CAV_SESSION)
        .expect(403);
    });

    it('filtra por cámara y usuario, de la más reciente a la más antigua', async () => {
      await pedirSesion('ING-CAM-01').expect(201);
      await pedirSesion('ING-CAM-02').expect(201);
      comoRol('SupervisorCAV', 'otro.cav');
      await pedirSesion('ING-CAM-01').expect(201);

      comoRol('SuperUser', 'admin.mock');
      const todas = await request(app.getHttpServer())
        .get('/cameras/views')
        .set(CAV_SESSION)
        .expect(200);
      const filtradas = await request(app.getHttpServer())
        .get('/cameras/views')
        .query({ cameraId: 'ING-CAM-01', username: 'cav.mock' })
        .set(CAV_SESSION)
        .expect(200);

      expect(
        todas.body.data.items.map(
          (item: { cameraId: string }) => item.cameraId,
        ),
      ).toEqual(['ING-CAM-01', 'ING-CAM-02', 'ING-CAM-01']);
      expect(filtradas.body.data.items).toHaveLength(1);
      expect(filtradas.body.data.items[0]).toMatchObject({
        cameraId: 'ING-CAM-01',
        username: 'cav.mock',
        status: 'issued',
      });
    });
  });
});
