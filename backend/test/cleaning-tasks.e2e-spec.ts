import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import {
  cleaningTaskResponse,
  PHASE_IDS,
} from './fixtures/cleaning-task.fixture';
import { mockSession } from './mocks/openmaint-core.mock';

describe('CleaningTasksController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());

    // Rol por defecto de esta suite: la mayoría de los escenarios ejercitan
    // un supervisor. Los tests que necesitan otro rol lo sobreescriben
    // puntualmente con mockResolvedValueOnce (BP-003: el rol se resuelve
    // contra la sesión real, no contra la cabecera x-role).
    mocks.openmaint.getSession.mockResolvedValue(
      mockSession({ role: 'SupervisorLimpieza' }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('GET /cleaning-tasks/all', () => {
    it('200 con sesión de supervisor', async () => {
      mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValueOnce({
        data: [],
        meta: { total: 0 },
      });

      await request(app.getHttpServer())
        .get('/cleaning-tasks/all')
        .set('x-session-token', 'mock-session-token')
        .expect(200);
    });

    it('403 con una sesión que no es de supervisor', async () => {
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ role: 'PersonalLimpieza' }),
      );

      await request(app.getHttpServer())
        .get('/cleaning-tasks/all')
        .set('x-session-token', 'mock-session-token')
        .expect(403);
    });

    // BP-003: antes el controller solo exigía que x-role viniera presente, y
    // el VALOR no se validaba contra la sesión de openMAINT — bastaba con
    // forjar la cabecera. Ahora el rol se resuelve contra la sesión real, así
    // que forjarla ya no sirve de nada.
    it('403 aunque x-role forjado diga SuperUser, si la sesión real no es de supervisor', async () => {
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ role: 'PersonalLimpieza' }),
      );

      await request(app.getHttpServer())
        .get('/cleaning-tasks/all')
        .set('x-session-token', 'mock-session-token')
        .set('x-role', 'SuperUser')
        .expect(403);

      expect(mocks.cleaningTasksOpenmaint.getAllTasks).not.toHaveBeenCalled();
    });
  });

  describe('GET /cleaning-tasks/mine', () => {
    it('200 con sesión y empleado presentes', async () => {
      mocks.cleaningTasksOpenmaint.getTasksByEmployee.mockResolvedValueOnce({
        data: [],
      });

      await request(app.getHttpServer())
        .get('/cleaning-tasks/mine')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .expect(200);
    });

    it('401 sin token de sesión', async () => {
      await request(app.getHttpServer())
        .get('/cleaning-tasks/mine')
        .set('x-cleaning-employee-id', '4567')
        .expect(401);
    });
  });

  describe('PATCH /:taskId/start', () => {
    it('200: Assigned → InExecution registra ActualStartTime', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({
          phase: PHASE_IDS.ASSIGNED,
          employee: 4567,
          actualStartTime: null,
        }),
      );
      mocks.cleaningTasksOpenmaint.updateTaskWithSession.mockResolvedValueOnce({
        data: { _id: 777, ActualStartTime: '2026-08-27T09:00:00Z' },
      });

      const res = await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/start')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .expect(200);

      expect(res.body.data.phase).toBe('InExecution');
      expect(res.body.data.isPaused).toBe(false);
    });

    it('403 cuando la tarea no está asignada a ese empleado', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED, employee: 9999 }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/start')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .expect(403);
    });

    it('400 al intentar iniciar una tarea ya cancelada', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.CANCELLED, employee: 4567 }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/start')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .expect(400);
    });

    it('404 si la tarea no existe', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce({
        data: null,
      });

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/999999/start')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .expect(404);
    });
  });

  describe('PATCH /:taskId/pause', () => {
    it('200: InExecution → Assigned con motivo', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({
          phase: PHASE_IDS.IN_EXECUTION,
          employee: 4567,
          actualStartTime: '2026-08-27T09:00:00Z',
        }),
      );
      mocks.cleaningTasksOpenmaint.updateTaskWithSession.mockResolvedValueOnce({
        data: { _id: 777, ExecutionTime: 30 },
      });

      const res = await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/pause')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .send({ reason: 'Falta de insumos' })
        .expect(200);

      expect(res.body.data.isPaused).toBe(true);
    });

    it('400 sin motivo de pausa (lo rechaza el DTO antes de tocar el service)', async () => {
      // No se encola getTaskById: el ValidationPipe global corta en el DTO
      // (PauseTaskDto.reason es @IsNotEmpty) antes de que el controller
      // llegue a llamar al service.
      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/pause')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .send({})
        .expect(400);

      expect(mocks.cleaningTasksOpenmaint.getTaskById).not.toHaveBeenCalled();
    });

    it('400 al pausar una tarea que nunca se inició', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({
          phase: PHASE_IDS.IN_EXECUTION,
          employee: 4567,
          actualStartTime: null,
        }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/pause')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .send({ reason: 'Motivo' })
        .expect(400);
    });
  });

  describe('PATCH /:taskId/complete', () => {
    it('200: InExecution → Completed', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({
          phase: PHASE_IDS.IN_EXECUTION,
          employee: 4567,
          actualStartTime: '2026-08-27T09:00:00Z',
        }),
      );
      mocks.cleaningTasksOpenmaint.updateTaskWithSession.mockResolvedValueOnce({
        data: { _id: 777 },
      });

      const res = await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/complete')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .send({ observations: 'Todo listo' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('400 al completar directamente desde Assigned (nunca se inició)', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED, employee: 4567 }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/complete')
        .set('x-session-token', 'mock-session-token')
        .set('x-cleaning-employee-id', '4567')
        .send({})
        .expect(400);
    });
  });

  describe('PATCH /:taskId/review', () => {
    it('200: aprueba una tarea Completed → Reviewed', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.COMPLETED, employee: 4567 }),
      );
      mocks.cleaningTasksOpenmaint.updateTaskWithSession.mockResolvedValueOnce({
        data: { _id: 777 },
      });

      const res = await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/review')
        .set('x-session-token', 'mock-session-token')
        .send({ approved: true })
        .expect(200);

      expect(res.body.data.phase).toBe('Reviewed');
    });

    it('403 si el rol no es supervisor', async () => {
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ role: 'PersonalLimpieza' }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/review')
        .set('x-session-token', 'mock-session-token')
        .send({ approved: true })
        .expect(403);

      expect(mocks.cleaningTasksOpenmaint.getTaskById).not.toHaveBeenCalled();
    });

    it('400 al revisar una tarea que no está Completed', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED, employee: 4567 }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/review')
        .set('x-session-token', 'mock-session-token')
        .send({ approved: true })
        .expect(400);
    });
  });

  describe('PATCH /:taskId/reopen', () => {
    it('200: Reviewed → Assigned', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.REVIEWED, employee: 4567 }),
      );
      mocks.cleaningTasksOpenmaint.updateTaskWithSession.mockResolvedValueOnce({
        data: { _id: 777 },
      });

      const res = await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/reopen')
        .set('x-session-token', 'mock-session-token')
        .send({ observations: 'Faltó limpiar la nevera' })
        .expect(200);

      expect(res.body.data.phase).toBe('Assigned');
    });

    it('400 al reabrir una tarea Assigned (no reabrible)', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED, employee: 4567 }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/reopen')
        .set('x-session-token', 'mock-session-token')
        .send({})
        .expect(400);
    });
  });

  describe('PATCH /:taskId/cancel', () => {
    it('200: cancela una tarea Assigned', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED, employee: 4567 }),
      );
      mocks.cleaningTasksOpenmaint.updateTaskWithSession.mockResolvedValueOnce({
        data: { _id: 777 },
      });

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/cancel')
        .set('x-session-token', 'mock-session-token')
        .send({ reason: 'Cancelación de reserva por el huésped' })
        .expect(200);
    });

    it('400 al cancelar una tarea ya Completed', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.COMPLETED, employee: 4567 }),
      );

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/cancel')
        .set('x-session-token', 'mock-session-token')
        .send({ reason: 'Ya no aplica' })
        .expect(400);
    });
  });
});
