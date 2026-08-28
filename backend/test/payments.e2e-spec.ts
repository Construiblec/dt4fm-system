import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';

describe('PaymentsController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('POST /payments/generate', () => {
    it('200 con skippedReason cuando no hay ConfigExpensa (no lanza)', async () => {
      mocks.paymentsOpenmaint.getConfigExpensa.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/payments/generate')
        .send({})
        .expect(200);

      expect(res.body.skippedReason).toMatch(/ConfigExpensa/);
      expect(res.body.created).toBe(0);
    });

    it('200 con skippedReason cuando hoy no es el DiaEmision configurado', async () => {
      const notToday = new Date().getDate() === 1 ? 2 : 1;
      mocks.paymentsOpenmaint.getConfigExpensa.mockResolvedValueOnce({
        DiaEmision: notToday,
        DiaVencimiento: notToday + 5,
      });

      const res = await request(app.getHttpServer())
        .post('/payments/generate')
        .send({})
        .expect(200);

      expect(res.body.skippedReason).toMatch(/DiaEmision/);
    });
  });

  describe('POST /payments/reminders', () => {
    it('200 con skippedReason cuando no hay configuración', async () => {
      mocks.paymentsOpenmaint.getConfigExpensa.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/payments/reminders')
        .send({})
        .expect(200);

      expect(res.body.skippedReason).toBeDefined();
      expect(mocks.mailer.sendBulk).not.toHaveBeenCalled();
    });
  });

  describe('POST /payments/overdue-notices', () => {
    it('200 con skippedReason cuando falta DiaVencimiento (force salta el chequeo de fecha)', async () => {
      mocks.paymentsOpenmaint.getConfigExpensa.mockResolvedValueOnce({
        DiaEmision: 5,
        DiaVencimiento: null,
      });

      const res = await request(app.getHttpServer())
        .post('/payments/overdue-notices')
        .send({ force: true })
        .expect(200);

      expect(res.body.skippedReason).toMatch(/DiaVencimiento/);
    });

    it('sin force, en un día que no es 1 ni 15 se salta sin llamar a openMAINT', async () => {
      const today = new Date().getDate();

      // Solo aplica el aserto fuerte fuera de los días de aviso; en 1 y 15 el
      // camino es el otro (consulta openMAINT), y ya queda cubierto arriba.
      if (![1, 15].includes(today)) {
        await request(app.getHttpServer())
          .post('/payments/overdue-notices')
          .send({ force: false })
          .expect(200);

        expect(mocks.paymentsOpenmaint.getConfigExpensa).not.toHaveBeenCalled();
      }
    });
  });
});
