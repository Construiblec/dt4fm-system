import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { preventiveResponse } from './fixtures/preventive.fixture';
import { PM_STATUS_IDS } from '../src/modules/preventive-maintenance/constants/preventive-maint.constants';

describe('PreventiveMaintenanceController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('GET /preventive-maintenance/my', () => {
    it('200: lista los preventivos activos del empleado', async () => {
      mocks.preventiveOpenmaint.findByAssignee.mockResolvedValueOnce({
        data: [preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }).data],
        meta: { total: 1 },
      });

      const res = await request(app.getHttpServer())
        .get('/preventive-maintenance/my')
        .set('authorization', 'mock-session-id')
        .set('x-employee-id', '4567')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('400 sin x-employee-id', async () => {
      await request(app.getHttpServer())
        .get('/preventive-maintenance/my')
        .set('authorization', 'mock-session-id')
        .expect(400);
    });
  });

  describe('GET /preventive-maintenance/suspension-reasons', () => {
    it('200: filtra los motivos inactivos', async () => {
      mocks.preventiveOpenmaint.findLookupValues.mockResolvedValueOnce({
        data: [
          { _id: 1, description: 'Falta de repuesto', active: true },
          { _id: 2, description: 'Motivo retirado', active: false },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/preventive-maintenance/suspension-reasons')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /preventive-maintenance/:id', () => {
    it('200: devuelve el detalle', async () => {
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );

      const res = await request(app.getHttpServer())
        .get('/preventive-maintenance/54321')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('404 si el mantenimiento no existe', async () => {
      mocks.preventiveOpenmaint.findById.mockRejectedValueOnce({
        response: { status: 404 },
      });

      await request(app.getHttpServer())
        .get('/preventive-maintenance/999999')
        .set('authorization', 'mock-session-id')
        .expect(404);
    });
  });

  describe('POST /preventive-maintenance/:id/start', () => {
    it('200: Acceptance → Execution avanza y relee dos veces', async () => {
      mocks.preventiveOpenmaint.findWithTasklist
        .mockResolvedValueOnce(
          preventiveResponse({ status: PM_STATUS_IDS.ACCEPTANCE }),
        )
        .mockResolvedValueOnce(
          preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
        );
      mocks.preventiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      mocks.preventiveOpenmaint.saveFields.mockResolvedValueOnce({ data: {} });
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );

      const res = await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/start')
        .set('authorization', 'mock-session-id')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(mocks.preventiveOpenmaint.advance).toHaveBeenCalled();
    });

    it('200 idempotente: si ya está en Execution no avanza de nuevo', async () => {
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );

      await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/start')
        .set('authorization', 'mock-session-id')
        .expect(201);

      expect(mocks.preventiveOpenmaint.advance).not.toHaveBeenCalled();
    });

    it('502 si openMAINT acepta el avance pero el estado no cambia', async () => {
      mocks.preventiveOpenmaint.findWithTasklist
        .mockResolvedValueOnce(
          preventiveResponse({ status: PM_STATUS_IDS.ACCEPTANCE }),
        )
        .mockResolvedValueOnce(
          preventiveResponse({ status: PM_STATUS_IDS.ACCEPTANCE }),
        );
      mocks.preventiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });

      await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/start')
        .set('authorization', 'mock-session-id')
        .expect(502);
    });
  });

  describe('PUT /preventive-maintenance/:id/checklist', () => {
    it('200: guarda las respuestas cuando hay checklist asociado', async () => {
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );
      mocks.preventiveOpenmaint.findChecklistCard.mockResolvedValueOnce({
        data: [
          {
            _id: 900,
            Data: JSON.stringify([
              {
                TaskDef: 6861754,
                Type: 1,
                ExecOrder: 1,
                Outcome: null,
                ND: false,
              },
            ]),
          },
        ],
      });
      mocks.preventiveOpenmaint.updateChecklistCard.mockResolvedValueOnce({
        data: {},
      });

      const res = await request(app.getHttpServer())
        .put('/preventive-maintenance/54321/checklist')
        .set('authorization', 'mock-session-id')
        .send({ items: [{ taskDefId: 6861754, value: 'OK' }] })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('400 con items vacío (ArrayNotEmpty del DTO)', async () => {
      await request(app.getHttpServer())
        .put('/preventive-maintenance/54321/checklist')
        .set('authorization', 'mock-session-id')
        .send({ items: [] })
        .expect(400);
    });
  });

  describe('POST /preventive-maintenance/:id/complete', () => {
    it('200: Execution → Completed sin checklist asociado (nada que exigir)', async () => {
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );
      // Línea base ya cubre findChecklistCard → { data: [] } (sin checklist).
      mocks.preventiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.COMPLETED }),
      );

      const res = await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/complete')
        .set('authorization', 'mock-session-id')
        .field('notes', 'Checklist completado, sin novedades')
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('409 al intentar completar un preventivo que no está en ejecución', async () => {
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.ACCEPTANCE }),
      );

      await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/complete')
        .set('authorization', 'mock-session-id')
        .expect(409);
    });
  });

  describe('POST /preventive-maintenance/:id/suspend', () => {
    it('201: Execution → Suspension con motivo', async () => {
      // fetchCardWithTasklist (1 lectura) → runAdvance → assertReachedStatus,
      // que relee con fetchCard (findById), NO con findWithTasklist otra vez.
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );
      mocks.preventiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.SUSPENSION }),
      );

      const res = await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/suspend')
        .set('authorization', 'mock-session-id')
        .send({ reasonId: 266683, notes: 'Falta de repuesto' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('400 sin reasonId (obligatorio en el DTO)', async () => {
      await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/suspend')
        .set('authorization', 'mock-session-id')
        .send({ notes: 'Sin motivo' })
        .expect(400);
    });

    it('409 al suspender un preventivo ya suspendido', async () => {
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.SUSPENSION }),
      );

      await request(app.getHttpServer())
        .post('/preventive-maintenance/54321/suspend')
        .set('authorization', 'mock-session-id')
        .send({ reasonId: 266683 })
        .expect(409);
    });
  });
});
