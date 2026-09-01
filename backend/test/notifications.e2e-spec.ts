import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession } from './mocks/openmaint-core.mock';

/**
 * Única suite que NO mockea NotificationsService: prueba el servicio real,
 * cortando la red por debajo — MailerService y el cliente de openMAINT
 * (a través de OpenmaintAuthService, que resuelve la sesión de servicio).
 */
describe('NotificationsController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp({ realNotificationsService: true }));
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('POST /notifications/bulk', () => {
    it('200: envía a todos los destinatarios cuando el proveedor no falla', async () => {
      mocks.openmaintAuth.login.mockResolvedValueOnce({ data: mockSession() });
      mocks.openmaintClient.get.mockResolvedValueOnce({
        data: {
          _id: 1,
          Code: 'AVISO',
          Subject: 'Hola {{email}}',
          Body: '<p>Cuerpo</p>',
        },
      });
      mocks.mailer.sendBulk.mockResolvedValueOnce({
        total: 1,
        sent: 1,
        failed: 0,
        results: [],
      });

      const res = await request(app.getHttpServer())
        .post('/notifications/bulk')
        .send({ templateId: '1', recipients: ['a@example.com'] })
        .expect(200);

      expect(res.body.sent).toBe(1);
    });

    it('503 cuando el proveedor de correo falla al enviar', async () => {
      mocks.openmaintAuth.login.mockResolvedValueOnce({ data: mockSession() });
      mocks.openmaintClient.get.mockResolvedValueOnce({
        data: { _id: 1, Code: 'AVISO', Subject: 'S', Body: 'B' },
      });
      mocks.mailer.sendBulk.mockResolvedValueOnce({
        total: 1,
        sent: 0,
        failed: 1,
        results: [],
      });

      await request(app.getHttpServer())
        .post('/notifications/bulk')
        .send({ templateId: '1', recipients: ['a@example.com'] })
        .expect(503);
    });

    it('400 si el destinatario no es un email válido', async () => {
      await request(app.getHttpServer())
        .post('/notifications/bulk')
        .send({ templateId: '1', recipients: ['no-es-un-email'] })
        .expect(400);
    });
  });

  describe('POST /notifications/mass-send', () => {
    it('200: deduplica destinatarios repetidos antes de contar', async () => {
      mocks.mailer.sendBulk.mockResolvedValueOnce({
        total: 1,
        sent: 1,
        failed: 0,
        results: [],
      });

      const res = await request(app.getHttpServer())
        .post('/notifications/mass-send')
        .send({
          template: { subject: 'Asunto', body: 'Cuerpo' },
          recipients: ['a@example.com', 'A@EXAMPLE.COM'],
        })
        .expect(200);

      expect(res.body.recipientsRequested).toBe(2);
      expect(res.body.recipientsDeduplicated).toBe(1);
      expect(res.body.sent).toBe(1);
    });

    it('400 sin destinatarios', async () => {
      await request(app.getHttpServer())
        .post('/notifications/mass-send')
        .send({
          template: { subject: 'Asunto', body: 'Cuerpo' },
          recipients: [],
        })
        .expect(400);
    });
  });

  describe('GET /notifications/mail/health', () => {
    it('200 cuando el proveedor responde ok', async () => {
      mocks.mailer.verifyProvider.mockResolvedValueOnce(true);

      const res = await request(app.getHttpServer())
        .get('/notifications/mail/health')
        .expect(200);

      expect(res.body.ok).toBe(true);
    });

    it('503 cuando el proveedor no está disponible', async () => {
      mocks.mailer.verifyProvider.mockResolvedValueOnce(false);

      await request(app.getHttpServer())
        .get('/notifications/mail/health')
        .expect(503);
    });
  });

  describe('CRUD /notifications/templates', () => {
    it('201: crea una plantilla', async () => {
      mocks.openmaintAuth.login.mockResolvedValue({ data: mockSession() });
      mocks.openmaintClient.post.mockResolvedValueOnce({
        data: { _id: 5, Code: 'NUEVA', Subject: 'S', Body: 'B' },
      });

      const res = await request(app.getHttpServer())
        .post('/notifications/templates')
        .send({ Code: 'NUEVA', Subject: 'S', Body: 'B' })
        .expect(201);

      expect(res.body.Code).toBe('NUEVA');
    });

    it('404 al consultar una plantilla que no existe', async () => {
      mocks.openmaintAuth.login.mockResolvedValue({ data: mockSession() });
      mocks.openmaintClient.get.mockResolvedValueOnce({ data: null });

      await request(app.getHttpServer())
        .get('/notifications/templates/999')
        .expect(404);
    });
  });
});
