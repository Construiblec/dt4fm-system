import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { correctiveResponse } from './fixtures/corrective.fixture';
import { preventiveResponse } from './fixtures/preventive.fixture';
import { CM_STATUS_IDS } from '../src/modules/maintenance-supervision/constants/corrective-maint.constants';
import { PM_STATUS_IDS } from '../src/modules/preventive-maintenance/constants/preventive-maint.constants';

describe('MaintenanceSupervisionController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('Autorización transversal', () => {
    it('401 sin cabecera de sesión', async () => {
      await request(app.getHttpServer())
        .get('/maintenance-supervision/corrective')
        .set('x-role', 'SupervisorMantenimiento')
        .expect(401);
    });

    it('403 con un rol que no es de supervisión', async () => {
      await request(app.getHttpServer())
        .get('/maintenance-supervision/corrective')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'PersonalLimpieza')
        .expect(403);
    });

    // El rol se valida contra la cabecera x-role, controlada por el cliente,
    // no contra la sesión de openMAINT. Mismo hueco que TS-001.
    it.todo(
      'el rol de supervisión debería resolverse desde la sesión de openMAINT, no de x-role (ver TS-001)',
    );
  });

  describe('GET /maintenance-supervision/:kind/:id', () => {
    it('400 con un kind que no es corrective ni preventive', async () => {
      await request(app.getHttpServer())
        .get('/maintenance-supervision/otro/1')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .expect(400);
    });
  });

  describe('POST /maintenance-supervision/corrective/:id/assign', () => {
    it('201: Assignment → Execution con fecha prevista en el body', async () => {
      mocks.correctiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.ASSIGNMENT }),
      );
      mocks.correctiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      // ExecStartDate:null evita el best-effort de clearAutoFilledExecStart.
      mocks.correctiveOpenmaint.findById.mockResolvedValueOnce(
        correctiveResponse({
          status: CM_STATUS_IDS.EXECUTION,
          execStartDate: null,
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/assign')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ assigneeId: 1456396, plannedStart: '2026-08-25T09:00:00.000Z' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('400 sin fecha prevista ni en el body ni en la tarjeta', async () => {
      mocks.correctiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        correctiveResponse({
          status: CM_STATUS_IDS.ASSIGNMENT,
          expExecStartDate: null,
        }),
      );

      await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/assign')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ assigneeId: 1456396 })
        .expect(400);
    });

    it('409 al asignar un correctivo que no está en Assignment', async () => {
      mocks.correctiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.EXECUTION }),
      );

      await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/assign')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ assigneeId: 1456396, plannedStart: '2026-08-25T09:00:00.000Z' })
        .expect(409);
    });
  });

  describe('POST /maintenance-supervision/corrective/:id/reject', () => {
    it('201: Assignment → Canceled con motivo', async () => {
      mocks.correctiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.ASSIGNMENT }),
      );
      mocks.correctiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      mocks.correctiveOpenmaint.findById.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.CANCELED }),
      );

      const res = await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/reject')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ notes: 'El reporte corresponde a un bien del propietario' })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('400 sin motivo (obligatorio en el DTO)', async () => {
      await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/reject')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({})
        .expect(400);
    });
  });

  describe('POST /maintenance-supervision/corrective/:id/review', () => {
    it('201: aprueba el cierre desde Accounting', async () => {
      mocks.correctiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.ACCOUNTING }),
      );
      mocks.correctiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      mocks.correctiveOpenmaint.findById.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.COMPLETED }),
      );

      const res = await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/review')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ approved: true })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('400 al rechazar sin motivo', async () => {
      await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/review')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ approved: false })
        .expect(400);

      expect(mocks.correctiveOpenmaint.findWithTasklist).not.toHaveBeenCalled();
    });

    it('409 si el correctivo no está pendiente de revisión', async () => {
      mocks.correctiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.EXECUTION }),
      );

      await request(app.getHttpServer())
        .post('/maintenance-supervision/corrective/12345/review')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ approved: true })
        .expect(409);
    });
  });

  describe('POST /maintenance-supervision/preventive/:id/assign', () => {
    it('201: Planning → Acceptance', async () => {
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.PLANNING }),
      );
      mocks.preventiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.ACCEPTANCE }),
      );

      const res = await request(app.getHttpServer())
        .post('/maintenance-supervision/preventive/54321/assign')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ assigneeId: 1456396 })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /maintenance-supervision/preventive/:id/resume', () => {
    it('201: Suspension → Execution', async () => {
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.SUSPENSION }),
      );
      mocks.preventiveOpenmaint.advance.mockResolvedValueOnce({ data: {} });
      mocks.preventiveOpenmaint.findById.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );

      const res = await request(app.getHttpServer())
        .post('/maintenance-supervision/preventive/54321/resume')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SuperUser')
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('409 al reanudar un preventivo que no está suspendido', async () => {
      mocks.preventiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }),
      );

      await request(app.getHttpServer())
        .post('/maintenance-supervision/preventive/54321/resume')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SuperUser')
        .expect(409);
    });
  });

  describe('PUT /maintenance-supervision/:kind/:id/planned-start', () => {
    it('200: fija la fecha prevista de un correctivo en Assignment', async () => {
      mocks.correctiveOpenmaint.findWithTasklist.mockResolvedValueOnce(
        correctiveResponse({ status: CM_STATUS_IDS.ASSIGNMENT }),
      );
      mocks.correctiveOpenmaint.saveFields.mockResolvedValueOnce({ data: {} });
      mocks.correctiveOpenmaint.findById.mockResolvedValueOnce(
        correctiveResponse({
          status: CM_STATUS_IDS.ASSIGNMENT,
          expExecStartDate: '2026-08-25T09:00:00.000Z',
        }),
      );

      await request(app.getHttpServer())
        .put('/maintenance-supervision/corrective/12345/planned-start')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({ plannedStart: '2026-08-25T09:00:00.000Z' })
        .expect(200);
    });

    it('400 sin plannedStart', async () => {
      await request(app.getHttpServer())
        .put('/maintenance-supervision/corrective/12345/planned-start')
        .set('authorization', 'mock-session-id')
        .set('x-role', 'SupervisorMantenimiento')
        .send({})
        .expect(400);
    });
  });
});
