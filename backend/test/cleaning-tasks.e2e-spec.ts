import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import {
  cleaningTaskCard,
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
      expect(mocks.pushDispatch.notifyCleaningReopened).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 777,
          cleaningEmployeeId: 4567,
          reason: 'Faltó limpiar la nevera',
        }),
      );
    });

    it('200 sin empleado: reabre pero no avisa a nadie', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.COMPLETED }),
      );
      mocks.cleaningTasksOpenmaint.updateTaskWithSession.mockResolvedValueOnce({
        data: { _id: 777 },
      });

      await request(app.getHttpServer())
        .patch('/cleaning-tasks/777/reopen')
        .set('x-session-token', 'mock-session-token')
        .send({})
        .expect(200);

      expect(mocks.pushDispatch.notifyCleaningReopened).not.toHaveBeenCalled();
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

  describe('Evidencia de supervisión', () => {
    // Como llegan de openMAINT: los adjuntos de clase traen el nombre en `name`
    // y la descripción vacía, aunque se haya enviado.
    type AttachmentFixture = {
      _id: string;
      name: string;
      category: string;
      description: string | null;
    };

    const operatorPhoto = (id: string): AttachmentFixture => ({
      _id: id,
      name: `1791204734903_${id}.jpg`,
      category: 'Photo',
      description: '',
    });
    const supervisionPhoto = (id: string): AttachmentFixture => ({
      _id: id,
      name: `supervision_1791204734903_${id}.jpg`,
      category: 'Photo',
      description: '',
    });
    const photos = (
      count: number,
      make: (id: string) => AttachmentFixture,
      prefix: string,
    ) => Array.from({ length: count }, (_, i) => make(`${prefix}-${i}`));

    const postEvidence = () =>
      request(app.getHttpServer())
        .post('/cleaning-tasks/777/supervision-evidence')
        .set('x-session-token', 'mock-session-token')
        .attach('file', Buffer.from('fake-image'), {
          filename: 'novedad.jpg',
          contentType: 'image/jpeg',
        });

    describe('POST /:taskId/supervision-evidence', () => {
      it('201: sube con la marca [Supervisión]; las fotos del operario no cuentan', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.COMPLETED, employee: 4567 }),
        );
        mocks.cleaningTasksOpenmaint.getAttachments.mockResolvedValueOnce({
          data: photos(10, operatorPhoto, 'op'),
        });
        mocks.cleaningTasksOpenmaint.uploadAttachment.mockResolvedValueOnce({
          data: { _id: 'sup-1', fileName: 'sup-1.jpg' },
        });

        const res = await postEvidence().expect(201);

        expect(res.body.data.origin).toBe('supervision');
        expect(
          mocks.cleaningTasksOpenmaint.uploadAttachment,
        ).toHaveBeenCalledWith(
          777,
          expect.any(Buffer),
          expect.stringMatching(/^supervision_/),
          'image/jpeg',
          'Photo',
          'mock-session-token',
          '[Supervisión]',
        );
      });

      it('201 también con la tarea Reviewed', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.REVIEWED, employee: 4567 }),
        );
        mocks.cleaningTasksOpenmaint.uploadAttachment.mockResolvedValueOnce({
          data: { _id: 'sup-1' },
        });

        await postEvidence().expect(201);
      });

      it('400 si la tarea no está Completed ni Reviewed', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED, employee: 4567 }),
        );

        await postEvidence().expect(400);

        expect(
          mocks.cleaningTasksOpenmaint.uploadAttachment,
        ).not.toHaveBeenCalled();
      });

      it('403 si el rol no es de supervisión', async () => {
        mocks.openmaint.getSession.mockResolvedValueOnce(
          mockSession({ role: 'MaintOffice' }),
        );

        await postEvidence().expect(403);

        expect(mocks.cleaningTasksOpenmaint.getTaskById).not.toHaveBeenCalled();
      });

      it('400 al llegar al tope de evidencia de supervisión', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.COMPLETED, employee: 4567 }),
        );
        mocks.cleaningTasksOpenmaint.getAttachments.mockResolvedValueOnce({
          data: photos(10, supervisionPhoto, 'sup'),
        });

        await postEvidence().expect(400);

        expect(
          mocks.cleaningTasksOpenmaint.uploadAttachment,
        ).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /:taskId/supervision-evidence/:attachmentId', () => {
      it('200: borra su propia evidencia', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.REVIEWED, employee: 4567 }),
        );
        mocks.cleaningTasksOpenmaint.getAttachments.mockResolvedValueOnce({
          data: [supervisionPhoto('sup-1')],
        });

        await request(app.getHttpServer())
          .delete('/cleaning-tasks/777/supervision-evidence/sup-1')
          .set('x-session-token', 'mock-session-token')
          .expect(200);

        expect(
          mocks.cleaningTasksOpenmaint.deleteAttachment,
        ).toHaveBeenCalledWith(777, 'sup-1', 'mock-session-token');
      });

      it('403 sobre una foto del operario', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.COMPLETED, employee: 4567 }),
        );
        mocks.cleaningTasksOpenmaint.getAttachments.mockResolvedValueOnce({
          data: [operatorPhoto('op-1')],
        });

        await request(app.getHttpServer())
          .delete('/cleaning-tasks/777/supervision-evidence/op-1')
          .set('x-session-token', 'mock-session-token')
          .expect(403);

        expect(
          mocks.cleaningTasksOpenmaint.deleteAttachment,
        ).not.toHaveBeenCalled();
      });
    });

    describe('fotos del operario', () => {
      it('201: el cupo del operario ignora la evidencia de supervisión', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({
            phase: PHASE_IDS.IN_EXECUTION,
            employee: 4567,
          }),
        );
        mocks.cleaningTasksOpenmaint.getAttachments.mockResolvedValueOnce({
          data: [
            ...photos(10, supervisionPhoto, 'sup'),
            ...photos(9, operatorPhoto, 'op'),
          ],
        });
        mocks.cleaningTasksOpenmaint.uploadAttachment.mockResolvedValueOnce({
          data: { _id: 'op-9' },
        });

        await request(app.getHttpServer())
          .post('/cleaning-tasks/777/attachments')
          .set('x-session-token', 'mock-session-token')
          .set('x-cleaning-employee-id', '4567')
          .field('description', '[Supervisión] intento de suplantar')
          .attach('file', Buffer.from('fake-image'), {
            filename: 'cocina.jpg',
            contentType: 'image/jpeg',
          })
          .expect(201);

        // La descripción del operario nunca llega a openMAINT.
        expect(
          mocks.cleaningTasksOpenmaint.uploadAttachment,
        ).toHaveBeenCalledWith(
          777,
          expect.any(Buffer),
          expect.any(String),
          'image/jpeg',
          'Photo',
          'mock-session-token',
        );
      });

      it('403: el operario no puede borrar evidencia de supervisión', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({
            phase: PHASE_IDS.IN_EXECUTION,
            employee: 4567,
          }),
        );
        mocks.cleaningTasksOpenmaint.getAttachments.mockResolvedValueOnce({
          data: [supervisionPhoto('sup-1')],
        });

        await request(app.getHttpServer())
          .delete('/cleaning-tasks/777/attachments/sup-1')
          .set('x-session-token', 'mock-session-token')
          .set('x-cleaning-employee-id', '4567')
          .expect(403);

        expect(
          mocks.cleaningTasksOpenmaint.deleteAttachment,
        ).not.toHaveBeenCalled();
      });
    });

    it('GET /:taskId marca el origen de cada adjunto', async () => {
      mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
        cleaningTaskResponse({ phase: PHASE_IDS.COMPLETED, employee: 4567 }),
      );
      mocks.cleaningTasksOpenmaint.getAttachments.mockResolvedValueOnce({
        data: [operatorPhoto('op-1'), supervisionPhoto('sup-1')],
      });

      const res = await request(app.getHttpServer())
        .get('/cleaning-tasks/777')
        .set('x-session-token', 'mock-session-token')
        .expect(200);

      expect(
        res.body.data.attachments.map((a: { id: string; origin: string }) => [
          a.id,
          a.origin,
        ]),
      ).toEqual([
        ['op-1', 'execution'],
        ['sup-1', 'supervision'],
      ]);
    });
  });

  describe('Coordinación', () => {
    const asCoordinator = () =>
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ role: 'Coordinador' }),
      );
    const asOperator = () =>
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ role: 'MaintOffice' }),
      );
    const token = 'mock-session-token';

    describe('GET /cleaning-tasks/all', () => {
      it('200 para el coordinador y reenvía el orden "recién creadas"', async () => {
        asCoordinator();

        await request(app.getHttpServer())
          .get('/cleaning-tasks/all?sort=newest&limit=500')
          .set('x-session-token', token)
          .expect(200);

        expect(mocks.cleaningTasksOpenmaint.getAllTasks).toHaveBeenCalledWith(
          expect.objectContaining({ sort: 'newest', limit: 500 }),
        );
      });

      it('trae el listing de Hostaway y el checklist de cada limpieza', async () => {
        asCoordinator();
        const card = {
          ...cleaningTaskCard({ phase: PHASE_IDS.ASSIGNED }),
          HostawayListingID: '412101',
          CleaningChecklist: 9001,
          _CleaningChecklist_description: 'Checkout estándar',
        };
        mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValueOnce({
          data: [card],
          meta: { total: 1 },
        });

        const res = await request(app.getHttpServer())
          .get('/cleaning-tasks/all')
          .set('x-session-token', token)
          .expect(200);

        expect(res.body.data[0]).toMatchObject({
          hostawayListingId: '412101',
          checklist: { id: 9001, description: 'Checkout estándar' },
          employee: null,
        });
      });
    });

    describe('PUT /cleaning-tasks/:id', () => {
      const put = (body: object) =>
        request(app.getHttpServer())
          .put('/cleaning-tasks/777')
          .set('x-session-token', token)
          .send(body);

      it('401 sin sesión (antes era público)', async () => {
        await request(app.getHttpServer())
          .put('/cleaning-tasks/777')
          .send({ observations: 'x' })
          .expect(401);
      });

      it('403 con un rol de operario', async () => {
        asOperator();
        await put({ observations: 'x' }).expect(403);
        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningTask,
        ).not.toHaveBeenCalled();
      });

      it('200: el coordinador completa unidad, checklist, horario, empleado y descripción', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue(
          cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED }),
        );

        const res = await put({
          description: ' Limpieza - Apto 310 ',
          checkoutDate: '2026-10-09',
          unitId: 5110,
          cleaningChecklistId: 9001,
          plannedStartTime: '2026-10-09T15:00:00.000Z',
          plannedEndTime: '2026-10-09T16:30:00.000Z',
          employeeId: 7004,
          observations: 'Avisar a recepción',
        }).expect(200);

        expect(res.body.notified).toBe(7004);
        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningTask,
        ).toHaveBeenCalledWith(
          777,
          expect.objectContaining({
            Description: 'Limpieza - Apto 310',
            CheckoutDate: '2026-10-09',
            Unit: 5110,
            CleaningChecklist: 9001,
            Employee: 7004,
            PlannedStartTime: '2026-10-09T15:00:00.000Z',
            PlannedEndTime: '2026-10-09T16:30:00.000Z',
            Observations: 'Avisar a recepción',
          }),
        );
      });

      it('null borra la unidad, el checklist y las observaciones', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue(
          cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED }),
        );

        await put({
          unitId: null,
          cleaningChecklistId: null,
          observations: null,
        }).expect(200);

        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningTask,
        ).toHaveBeenCalledWith(777, {
          Unit: null,
          CleaningChecklist: null,
          Observations: null,
        });
      });

      it('400 si el fin no es posterior al inicio', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue(
          cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED }),
        );

        await put({
          plannedStartTime: '2026-10-09T16:00:00.000Z',
          plannedEndTime: '2026-10-09T15:00:00.000Z',
        }).expect(400);
      });

      it('403: el coordinador no edita una limpieza que ya empezó', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue(
          cleaningTaskResponse({
            phase: PHASE_IDS.IN_EXECUTION,
            actualStartTime: '2026-10-08T14:02:00Z',
          }),
        );

        await put({ observations: 'x' }).expect(403);
        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningTask,
        ).not.toHaveBeenCalled();
      });

      it('403: tampoco una reabierta (Assigned con inicio anterior)', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue(
          cleaningTaskResponse({
            phase: PHASE_IDS.ASSIGNED,
            actualStartTime: '2026-10-07T14:02:00Z',
          }),
        );

        await put({ observations: 'x' }).expect(403);
      });

      it('403: el coordinador no puede cambiar la fase ni los tiempos', async () => {
        asCoordinator();
        await put({ phase: 'Completed' }).expect(403);
        asCoordinator();
        await put({ executionTime: 90 }).expect(403);
        expect(
          mocks.cleaningTasksOpenmaint.getTaskByIdWithSession,
        ).not.toHaveBeenCalled();
      });

      it('200: supervisión sigue pudiendo corregir la fase sin pasar por la regla del coordinador', async () => {
        await put({ phase: 'Assigned' }).expect(200);
        expect(
          mocks.cleaningTasksOpenmaint.getTaskByIdWithSession,
        ).not.toHaveBeenCalled();
      });

      it('400 si no hay nada que actualizar', async () => {
        await put({}).expect(400);
      });
    });

    describe('POST /cleaning-tasks/manual', () => {
      const body = {
        description: ' Limpieza profunda - Pradera, Suite I41 ',
        plannedStartTime: '2026-10-09T14:00:00.000Z',
        plannedEndTime: '2026-10-09T16:30:00.000Z',
      };
      const post = (payload: object) =>
        request(app.getHttpServer())
          .post('/cleaning-tasks/manual')
          .set('x-session-token', token)
          .send(payload);

      it('401 sin sesión', async () => {
        await request(app.getHttpServer())
          .post('/cleaning-tasks/manual')
          .send(body)
          .expect(401);
      });

      it('403 para supervisión: crear no es de su rol', async () => {
        await post(body).expect(403);
      });

      it('201: nace con Source Manual y fase Asignada, sin empleado ni unidad', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.createCleaningTask.mockResolvedValueOnce({
          data: { _id: 888, TaskNumber: 'CT.2026.1234' },
        });

        const res = await post(body).expect(201);

        expect(res.body).toMatchObject({ created: true, taskId: 888 });
        const sent =
          mocks.cleaningTasksOpenmaint.createCleaningTask.mock.calls[0][0];
        expect(sent).toMatchObject({
          Source: 'Manual',
          phase: 'Assigned',
          Description: 'Limpieza profunda - Pradera, Suite I41',
          PlannedStartTime: body.plannedStartTime,
          PlannedEndTime: body.plannedEndTime,
        });
        expect(sent).not.toHaveProperty('Employee');
        expect(sent).not.toHaveProperty('Unit');
        expect(sent).not.toHaveProperty('HostawayReservation');
        expect(sent.TaskNumber).toMatch(/^CT\.\d{4}\.\d{4}$/);
        expect(sent.GeneratedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it('201 con todo: unidad, empleado, checklist y observaciones', async () => {
        asCoordinator();
        await post({
          ...body,
          unitId: 5901,
          employeeId: 7006,
          cleaningChecklistId: 9002,
          observations: 'Pedido del propietario',
        }).expect(201);

        expect(
          mocks.cleaningTasksOpenmaint.createCleaningTask,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            Unit: 5901,
            Employee: 7006,
            CleaningChecklist: 9002,
            Observations: 'Pedido del propietario',
          }),
        );
      });

      it('400 sin descripción', async () => {
        // La validación del cuerpo corre antes de resolver el rol: no se encola sesión.
        await post({ ...body, description: undefined }).expect(400);
      });

      it('400 sin horario', async () => {
        // La validación del cuerpo corre antes de resolver el rol: no se encola sesión.
        await post({ description: 'x' }).expect(400);
      });

      it('400 si el fin no es posterior al inicio', async () => {
        asCoordinator();
        await post({
          ...body,
          plannedEndTime: body.plannedStartTime,
        }).expect(400);
        expect(
          mocks.cleaningTasksOpenmaint.createCleaningTask,
        ).not.toHaveBeenCalled();
      });
    });

    describe('PATCH /:taskId/cancel con el rol coordinador', () => {
      it('200: cancela una limpieza que no empezó, por la sesión interna', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.ASSIGNED }),
        );

        await request(app.getHttpServer())
          .patch('/cleaning-tasks/777/cancel')
          .set('x-session-token', token)
          .send({ reason: 'La reserva se canceló en Hostaway.' })
          .expect(200);

        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningTask,
        ).toHaveBeenCalledWith(777, {
          phase: PHASE_IDS.CANCELLED,
          Notes: 'La reserva se canceló en Hostaway.',
        });
        expect(
          mocks.cleaningTasksOpenmaint.updateTaskWithSession,
        ).not.toHaveBeenCalled();
      });

      it('403: no cancela una limpieza en ejecución', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({
            phase: PHASE_IDS.IN_EXECUTION,
            actualStartTime: '2026-10-08T14:02:00Z',
          }),
        );

        await request(app.getHttpServer())
          .patch('/cleaning-tasks/777/cancel')
          .set('x-session-token', token)
          .send({ reason: 'x' })
          .expect(403);
      });

      it('supervisión sigue cancelando una en ejecución', async () => {
        mocks.cleaningTasksOpenmaint.getTaskById.mockResolvedValueOnce(
          cleaningTaskResponse({ phase: PHASE_IDS.IN_EXECUTION }),
        );

        await request(app.getHttpServer())
          .patch('/cleaning-tasks/777/cancel')
          .set('x-session-token', token)
          .send({ reason: 'Ya no aplica' })
          .expect(200);
      });
    });

    describe('GET /cleaning-tasks/employees', () => {
      it('lista solo empleados internos con su equipo', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.listInternalEmployees.mockResolvedValueOnce(
          {
            data: [
              {
                _id: 7001,
                Description: 'maria.lopez',
                Team: 801,
                _Team_description: 'Limpieza Torres A-B',
              },
              { _id: 7007, Description: 'diego.mora', Team: null },
            ],
          },
        );

        const res = await request(app.getHttpServer())
          .get('/cleaning-tasks/employees')
          .set('x-session-token', token)
          .expect(200);

        expect(res.body.data).toEqual([
          {
            id: 7001,
            name: 'maria.lopez',
            team: { id: 801, name: 'Limpieza Torres A-B' },
          },
          { id: 7007, name: 'diego.mora', team: null },
        ]);
      });

      it('403 para supervisión', async () => {
        await request(app.getHttpServer())
          .get('/cleaning-tasks/employees')
          .set('x-session-token', token)
          .expect(403);
      });
    });

    describe('Checklists', () => {
      const card = {
        _id: 9003,
        Code: 'CHK-REP',
        Description: 'Repaso entre estancias cortas.',
        NombrePlantilla: 'Repaso rápido',
        Detalle: 'Dormitorio,Estirar la cama\nBaño,Limpiar inodoro\n',
        Plantilla: null,
      };

      it('GET lista: usa el Detalle cuando no hay archivo', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.listCleaningActivities.mockResolvedValueOnce(
          { data: [card] },
        );

        const res = await request(app.getHttpServer())
          .get('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .expect(200);

        expect(res.body.data[0]).toMatchObject({
          id: 9003,
          templateName: 'Repaso rápido',
          plantilla: null,
          source: 'detalle',
          activities: ['Dormitorio,Estirar la cama', 'Baño,Limpiar inodoro'],
        });
      });

      it('GET lista: lee el archivo CSV y dice su codificación', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.listCleaningActivities.mockResolvedValueOnce(
          {
            data: [
              {
                ...card,
                Detalle: 'se ignora',
                Plantilla: 'att-9',
                _Plantilla_FileName: 'repaso.csv',
              },
            ],
          },
        );
        mocks.cleaningTasksOpenmaint.downloadActivityTemplate.mockResolvedValueOnce(
          {
            data: Buffer.from('Titulo;Actividad;Minutos\nBaño;Lavar;5\n'),
            contentType: 'text/csv',
            fileName: 'repaso.csv',
          },
        );

        const res = await request(app.getHttpServer())
          .get('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .expect(200);

        expect(res.body.data[0]).toMatchObject({
          source: 'archivo',
          plantilla: { fileName: 'repaso.csv', readable: true },
        });
        expect(res.body.data[0].activities).toContain('Baño;Lavar;5');
      });

      it('GET lista: 403 para supervisión', async () => {
        await request(app.getHttpServer())
          .get('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .expect(403);
      });

      it('POST crea con Detalle (sin archivo)', async () => {
        asCoordinator();

        const res = await request(app.getHttpServer())
          .post('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .field('templateName', 'Repaso rápido')
          .field('description', 'Entre estancias cortas')
          .field('code', 'CHK-REP')
          .field('detalle', 'Baño,Limpiar inodoro,5')
          .expect(201);

        expect(res.body).toMatchObject({
          saved: true,
          created: true,
          id: 9100,
        });
        expect(
          mocks.cleaningTasksOpenmaint.createCleaningActivity,
        ).toHaveBeenCalledWith({
          NombrePlantilla: 'Repaso rápido',
          Description: 'Entre estancias cortas',
          Code: 'CHK-REP',
          Detalle: 'Baño,Limpiar inodoro,5',
        });
        expect(
          mocks.cleaningTasksOpenmaint.uploadActivityTemplate,
        ).not.toHaveBeenCalled();
      });

      it('POST con archivo CSV: lo sube a la plantilla', async () => {
        asCoordinator();

        await request(app.getHttpServer())
          .post('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .field('templateName', 'Profunda')
          .field('description', 'A fondo')
          .attach(
            'plantilla',
            Buffer.from('Titulo;Actividad;Minutos\nBaño;Lavar;5\n'),
            {
              filename: 'profunda.csv',
              contentType: 'text/csv',
            },
          )
          .expect(201);

        expect(
          mocks.cleaningTasksOpenmaint.uploadActivityTemplate,
        ).toHaveBeenCalledWith(
          9100,
          expect.objectContaining({ originalname: 'profunda.csv' }),
        );
      });

      it('POST rechaza un .xlsx disfrazado de CSV', async () => {
        asCoordinator();

        const res = await request(app.getHttpServer())
          .post('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .field('templateName', 'Profunda')
          .field('description', 'A fondo')
          .attach('plantilla', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), {
            filename: 'profunda.csv',
            contentType: 'text/csv',
          })
          .expect(400);

        expect(res.body.message).toMatch(/xlsx/);
        expect(
          mocks.cleaningTasksOpenmaint.createCleaningActivity,
        ).not.toHaveBeenCalled();
      });

      it('POST 400 sin nombre, sin descripción o sin contenido', async () => {
        // El cuerpo inválido se rechaza antes de resolver el rol.
        await request(app.getHttpServer())
          .post('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .field('description', 'x')
          .field('detalle', 'a,b')
          .expect(400);
        await request(app.getHttpServer())
          .post('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .field('templateName', 'x')
          .field('detalle', 'a,b')
          .expect(400);
        asCoordinator();
        await request(app.getHttpServer())
          .post('/cleaning-tasks/checklists')
          .set('x-session-token', token)
          .field('templateName', 'x')
          .field('description', 'x')
          .expect(400);
      });

      it('PUT reemplaza el archivo anterior', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getCleaningActivity.mockResolvedValueOnce({
          data: { ...card, Plantilla: 'att-viejo' },
        });

        await request(app.getHttpServer())
          .put('/cleaning-tasks/checklists/9003')
          .set('x-session-token', token)
          .field('templateName', 'Repaso rápido')
          .field('description', 'Entre estancias cortas')
          .attach('plantilla', Buffer.from('Titulo;Actividad\nBaño;Lavar\n'), {
            filename: 'nuevo.csv',
            contentType: 'text/csv',
          })
          .expect(200);

        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningActivity,
        ).toHaveBeenCalledWith(
          9003,
          expect.objectContaining({
            NombrePlantilla: 'Repaso rápido',
            Plantilla: null,
          }),
        );
        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningActivity,
        ).toHaveBeenCalledWith(9003, { Plantilla: 'att-1' });
        expect(
          mocks.cleaningTasksOpenmaint.uploadActivityTemplate,
        ).toHaveBeenCalledWith(
          9003,
          expect.objectContaining({ originalname: 'nuevo.csv' }),
        );
      });

      it('PUT con removeTemplate quita el archivo y deja el Detalle', async () => {
        asCoordinator();
        mocks.cleaningTasksOpenmaint.getCleaningActivity.mockResolvedValueOnce({
          data: { ...card, Plantilla: 'att-viejo' },
        });

        await request(app.getHttpServer())
          .put('/cleaning-tasks/checklists/9003')
          .set('x-session-token', token)
          .field('templateName', 'Repaso rápido')
          .field('description', 'Entre estancias cortas')
          .field('detalle', 'Baño,Limpiar')
          .field('removeTemplate', 'true')
          .expect(200);

        expect(
          mocks.cleaningTasksOpenmaint.updateCleaningActivity,
        ).toHaveBeenCalledWith(
          9003,
          expect.objectContaining({ Plantilla: null }),
        );
        expect(
          mocks.cleaningTasksOpenmaint.uploadActivityTemplate,
        ).not.toHaveBeenCalled();
      });
    });

    describe('GET /cleaning-tasks/checkouts/preview', () => {
      const hostaway = (
        reservationId: string,
        listingId: string,
        checkoutDate: string,
      ) => ({
        reservationId,
        listingId,
        listingName: `Listing ${listingId}`,
        checkoutDate,
        checkoutTime: 11,
        guestName: 'No se usa',
      });
      const taskCard = (
        id: number,
        reservation: string,
        checkoutDate: string,
        extra: object = {},
      ) => ({
        ...cleaningTaskCard({ id, phase: PHASE_IDS.ASSIGNED }),
        HostawayReservation: reservation,
        HostawayListingID: '412101',
        CheckoutDate: checkoutDate,
        Description: 'Limpieza - Listing 412101',
        ...extra,
      });

      it('403 para supervisión', async () => {
        await request(app.getHttpServer())
          .get(
            '/cleaning-tasks/checkouts/preview?dateFrom=2026-10-08&dateTo=2026-10-10',
          )
          .set('x-session-token', token)
          .expect(403);
      });

      it('clasifica por crear, ya creada, checkout cambiado y huérfana', async () => {
        asCoordinator();
        mocks.hostaway.getCheckouts
          // 1ª llamada: el rango pedido
          .mockResolvedValueOnce({
            result: [
              hostaway('R1', '412101', '2026-10-08'), // sin limpieza
              hostaway('R2', '412101', '2026-10-08'), // ya creada
              hostaway('R3', '412101', '2026-10-09'), // la limpieza dice otro día
            ],
          })
          // 2ª llamada: la ventana ancha, para distinguir cambio de huérfana
          .mockResolvedValueOnce({
            result: [hostaway('R5', '412102', '2026-10-30')],
          });
        mocks.cleaningTasksOpenmaint.getHostawayTasks.mockResolvedValueOnce({
          data: [
            taskCard(1, 'R2', '2026-10-08'),
            taskCard(2, 'R3', '2026-10-08'),
            taskCard(3, 'R4', '2026-10-09'), // ya no está en Hostaway
            taskCard(4, 'R5', '2026-10-09'), // se movió al 30
          ],
        });
        mocks.cleaningTasksOpenmaint.listUnitsWithListing.mockResolvedValueOnce(
          {
            data: [
              { _id: 1, HostawayListingID: '412101' },
              { _id: 2, HostawayListingID: '412102' },
              { _id: 3, HostawayListingID: '412102' },
            ],
          },
        );

        const res = await request(app.getHttpServer())
          .get(
            '/cleaning-tasks/checkouts/preview?dateFrom=2026-10-08&dateTo=2026-10-10',
          )
          .set('x-session-token', token)
          .expect(200);

        const byReservation = Object.fromEntries(
          res.body.rows.map((r: { reservationId: string }) => [
            r.reservationId,
            r,
          ]),
        );
        expect(byReservation.R1).toMatchObject({
          status: 'por-crear',
          task: null,
          unitMatch: 'ok',
        });
        expect(byReservation.R2).toMatchObject({ status: 'creada' });
        expect(byReservation.R2.task.id).toBe(1);
        expect(byReservation.R3).toMatchObject({
          status: 'cambio',
          checkoutDate: '2026-10-08',
          hostawayCheckoutDate: '2026-10-09',
        });
        expect(byReservation.R4).toMatchObject({
          status: 'huerfana',
          hostawayCheckoutDate: null,
          checkoutDate: '2026-10-09',
        });
        expect(byReservation.R5).toMatchObject({
          status: 'cambio',
          hostawayCheckoutDate: '2026-10-30',
          unitMatch: 'ambiguous',
        });
        expect(res.body.count).toBe(5);
      });

      it('no consulta la ventana ancha si no hay limpiezas sueltas', async () => {
        asCoordinator();
        mocks.hostaway.getCheckouts.mockResolvedValueOnce({
          result: [hostaway('R1', '412101', '2026-10-08')],
        });

        await request(app.getHttpServer())
          .get(
            '/cleaning-tasks/checkouts/preview?dateFrom=2026-10-08&dateTo=2026-10-08',
          )
          .set('x-session-token', token)
          .expect(200);

        expect(mocks.hostaway.getCheckouts).toHaveBeenCalledTimes(1);
      });

      it('una limpieza cancelada no se marca como huérfana otra vez', async () => {
        asCoordinator();
        mocks.hostaway.getCheckouts.mockResolvedValueOnce({ result: [] });
        mocks.cleaningTasksOpenmaint.getHostawayTasks.mockResolvedValueOnce({
          data: [
            {
              ...taskCard(9, 'R9', '2026-10-08'),
              _phase_description: 'Cancelled',
            },
          ],
        });

        const res = await request(app.getHttpServer())
          .get(
            '/cleaning-tasks/checkouts/preview?dateFrom=2026-10-08&dateTo=2026-10-08',
          )
          .set('x-session-token', token)
          .expect(200);

        expect(res.body.rows).toEqual([]);
      });
    });

    describe('Sincronización', () => {
      it('envía HostawayListingID al crear y reporta qué reservas fallaron', async () => {
        mocks.hostaway.getCheckouts.mockResolvedValueOnce({
          result: [
            {
              reservationId: 'R1',
              listingId: '412101',
              listingName: 'Apto 101',
              checkoutDate: '2026-10-08',
              checkoutTime: 11,
              guestName: 'x',
            },
            {
              reservationId: 'R2',
              listingId: '412102',
              listingName: 'Apto 102',
              checkoutDate: '2026-10-08',
              checkoutTime: '12:00',
              guestName: 'x',
            },
          ],
        });
        mocks.cleaningTasksOpenmaint.createCleaningTask
          .mockResolvedValueOnce({ data: { _id: 1, TaskNumber: 'CT.1' } })
          .mockRejectedValueOnce(new Error('openMAINT no respondió'));

        const res = await request(app.getHttpServer())
          .post('/cleaning-tasks/sync')
          .send({ dateFrom: '2026-10-08', dateTo: '2026-10-08' })
          .expect(201);

        expect(res.body).toMatchObject({ total: 2, created: 1, failed: 1 });
        expect(res.body.errors).toEqual([
          expect.objectContaining({
            reservationId: 'R2',
            listingName: 'Apto 102',
          }),
        ]);
        const first =
          mocks.cleaningTasksOpenmaint.createCleaningTask.mock.calls[0][0];
        expect(first).toMatchObject({
          HostawayListingID: '412101',
          HostawayReservation: 'R1',
          CheckoutDate: '2026-10-08',
          Source: 'Hostaway',
        });
      });

      it('los números de tarea de una misma tanda no se repiten', async () => {
        const result = Array.from({ length: 6 }, (_, i) => ({
          reservationId: `R${i}`,
          listingId: '412101',
          listingName: 'Apto 101',
          checkoutDate: '2026-10-08',
          checkoutTime: 11,
          guestName: 'x',
        }));
        mocks.hostaway.getCheckouts.mockResolvedValueOnce({ result });

        await request(app.getHttpServer())
          .post('/cleaning-tasks/sync')
          .send({ dateFrom: '2026-10-08', dateTo: '2026-10-08' })
          .expect(201);

        const numbers =
          mocks.cleaningTasksOpenmaint.createCleaningTask.mock.calls.map(
            (c) => c[0].TaskNumber,
          );
        expect(new Set(numbers).size).toBe(6);
      });
    });
  });
});
