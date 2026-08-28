import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession } from './mocks/openmaint-core.mock';
import { PushSubscriptionRepository } from '../src/modules/push-notifications/push-subscription.repository';

/**
 * Único módulo con persistencia real (Postgres en CI / docker-compose local).
 * Se apoya en el repositorio inyectado por la app — real en el diseño
 * entregado — para sembrar e inspeccionar estado sin pasar por HTTP.
 */
describe('PushNotificationsController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let repo: PushSubscriptionRepository;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    repo = app.get(PushSubscriptionRepository);
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('GET /push/vapid-public-key', () => {
    it('200 con la clave pública (vacía en este entorno de pruebas)', async () => {
      const res = await request(app.getHttpServer())
        .get('/push/vapid-public-key')
        .expect(200);

      expect(res.body).toEqual({ publicKey: '' });
    });
  });

  describe('POST /push/subscribe', () => {
    it('204: registra la suscripción resolviendo la identidad desde la sesión', async () => {
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ userId: 777 }),
      );

      await request(app.getHttpServer())
        .post('/push/subscribe')
        .set('authorization', 'mock-session-id')
        .send({
          endpoint: 'https://push.example.com/device-1',
          keys: { p256dh: 'clave-p256dh', auth: 'clave-auth' },
        })
        .expect(204);

      const subs = await repo.findByEmployeeId(4567); // default del mock
      expect(subs.some((s) => s.userId === '777')).toBe(true);
    });

    it('401 sin sesión de openMAINT válida', async () => {
      mocks.openmaint.getSession.mockRejectedValueOnce({
        response: { status: 400 },
      });

      await request(app.getHttpServer())
        .post('/push/subscribe')
        .set('authorization', 'sesion-invalida')
        .send({
          endpoint: 'https://push.example.com/device-2',
          keys: { p256dh: 'x', auth: 'y' },
        })
        .expect(401);
    });

    it('401 sin ninguna cabecera de sesión', async () => {
      await request(app.getHttpServer())
        .post('/push/subscribe')
        .send({
          endpoint: 'https://push.example.com/device-3',
          keys: { p256dh: 'x', auth: 'y' },
        })
        .expect(401);
    });

    it('400 si falta el endpoint', async () => {
      await request(app.getHttpServer())
        .post('/push/subscribe')
        .set('authorization', 'mock-session-id')
        .send({ keys: { p256dh: 'x', auth: 'y' } })
        .expect(400);
    });
  });

  describe('DELETE /push/subscribe', () => {
    it('204 sin exigir sesión (se llama al cerrarla)', async () => {
      await request(app.getHttpServer())
        .delete('/push/subscribe')
        .send({ endpoint: 'https://push.example.com/device-a-borrar' })
        .expect(204);
    });
  });

  describe('Historial de notificaciones', () => {
    /**
     * Un `userId` distinto en cada ejecución.
     *
     * La tabla `notifications` es REAL y persiste entre corridas: con un id
     * fijo, la segunda vez que se lanzan las pruebas el listado devuelve
     * también las filas de la corrida anterior y los conteos dejan de
     * cuadrar. Aislar por usuario es preferible a truncar la tabla — no pisa
     * datos de nadie más y deja el test a salvo si algún día las suites
     * corren en paralelo contra la misma base.
     */
    const freshUserId = () => 1_000_000 + Math.floor(Math.random() * 8_000_000);

    it('el listado trae lo sembrado, más reciente primero, y el contador de no leídas coincide', async () => {
      const numericUserId = freshUserId();
      const userId = String(numericUserId);

      await repo.saveNotification(userId, {
        type: 'corrective_opened',
        title: 'Correctivo abierto',
        body: 'Se abrió un correctivo',
        deepLink: null,
        entityKind: 'corrective',
        entityId: '1',
      });
      await repo.saveNotification(userId, {
        type: 'corrective_opened',
        title: 'Segundo aviso',
        body: 'Otro correctivo',
        deepLink: null,
        entityKind: 'corrective',
        entityId: '2',
      });

      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ userId: numericUserId }),
      );

      const list = await request(app.getHttpServer())
        .get('/push/notifications')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(list.body.notifications).toHaveLength(2);
      expect(
        list.body.notifications.map((n: { title: string }) => n.title).sort(),
      ).toEqual(['Correctivo abierto', 'Segundo aviso'].sort());
      expect(list.body.unread).toBe(2);

      const unread = await request(app.getHttpServer())
        .get('/push/notifications/unread-count')
        .set('authorization', 'mock-session-id')
        .expect(200);
      expect(unread.body.unread).toBe(2);

      const oneId = list.body.notifications[0].id;
      const afterOne = await request(app.getHttpServer())
        .post(`/push/notifications/${oneId}/read`)
        .set('authorization', 'mock-session-id')
        .expect(200);
      expect(afterOne.body.unread).toBe(1);

      const afterAll = await request(app.getHttpServer())
        .post('/push/notifications/read-all')
        .set('authorization', 'mock-session-id')
        .expect(200);
      expect(afterAll.body.unread).toBe(0);
    });

    it('marcar como leída una notificación ajena es idempotente, no un error', async () => {
      // Usuario nuevo y sin notificaciones propias, para que el contador que
      // devuelve sea 0 por no tener nada, no por lo que dejara otra corrida.
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ userId: freshUserId() }),
      );

      const res = await request(app.getHttpServer())
        .post('/push/notifications/00000000-0000-0000-0000-000000000000/read')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(res.body.unread).toBe(0);
    });

    it('400 con un id que no es UUID', async () => {
      await request(app.getHttpServer())
        .post('/push/notifications/no-es-un-uuid/read')
        .set('authorization', 'mock-session-id')
        .expect(400);
    });
  });
});
