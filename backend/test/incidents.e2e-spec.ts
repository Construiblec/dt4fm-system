import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';

describe('IncidentsController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('POST /incidents', () => {
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/incidents')
        .set('authorization', 'mock-session-id')
        .set('x-employee-id', '999')
        .send({ buildingId: 100, notes: 'Prueba E2E', ...body });

    const sent = () =>
      mocks.openmaint.createCorrectiveMaintIncident.mock.calls[0][0];

    it('crea la incidencia con categoría y la subcategoría como título', async () => {
      const res = await post({ categoryId: 1, subcategoryId: 11 }).expect(201);

      expect(res.body.incidentId).toBe(12345);
      expect(res.body.requester).toBe(999);
      // Sin prioridad: la fija el supervisor al asignar.
      expect(
        mocks.openmaint.createCorrectiveMaintIncident,
      ).toHaveBeenCalledWith(
        expect.not.objectContaining({ Priority: expect.anything() }),
        'mock-session-id',
      );
      expect(sent()).toMatchObject({
        Category: 1,
        Subcategory: 11,
        ShortDescr: 'Sistema de agua caliente',
      });
    });

    it('ignora el texto libre si la subcategoría no es «Otro»', async () => {
      await post({
        categoryId: 1,
        subcategoryId: 11,
        shortDescription: 'Otra cosa',
      }).expect(201);

      expect(sent().ShortDescr).toBe('Sistema de agua caliente');
    });

    it('con «Otro» usa el texto escrito como título', async () => {
      await post({
        categoryId: 1,
        subcategoryId: 19,
        shortDescription: ' Puerta del clóset descuadrada ',
      }).expect(201);

      expect(sent()).toMatchObject({
        Subcategory: 19,
        ShortDescr: 'Puerta del clóset descuadrada',
      });
    });

    it('400 si la subcategoría es «Otro» y no hay texto', async () => {
      await post({ categoryId: 1, subcategoryId: 19 }).expect(400);
      expect(
        mocks.openmaint.createCorrectiveMaintIncident,
      ).not.toHaveBeenCalled();
    });

    it('400 si la subcategoría es de otra categoría', async () => {
      await post({ categoryId: 2, subcategoryId: 11 }).expect(400);
      expect(
        mocks.openmaint.createCorrectiveMaintIncident,
      ).not.toHaveBeenCalled();
    });

    it('400 si falta la categoría', async () => {
      await post({ shortDescription: 'Sin categoría' }).expect(400);
    });

    it('400 si faltan las cabeceras obligatorias', async () => {
      await request(app.getHttpServer())
        .post('/incidents')
        .send({
          buildingId: 100,
          categoryId: 1,
          subcategoryId: 11,
          notes: 'Prueba sin headers',
        })
        .expect(400);
    });

    it('400 si el texto de «Otro» supera los 80 caracteres', async () => {
      await post({
        categoryId: 1,
        subcategoryId: 19,
        shortDescription: 'x'.repeat(81),
      }).expect(400);
    });
  });

  describe('GET /incidents/categories', () => {
    it('devuelve las categorías con sus subcategorías', async () => {
      const res = await request(app.getHttpServer())
        .get('/incidents/categories')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(res.body.map((c: { name: string }) => c.name)).toEqual([
        'Limpieza',
        'Mantenimiento',
      ]);
    });

    it('400 sin sesión', async () => {
      await request(app.getHttpServer())
        .get('/incidents/categories')
        .expect(400);
    });
  });

  describe('POST /incidents/:id/start', () => {
    it('sella ExecStartDate cuando el correctivo está Assigned (Execution sin ExecStartDate)', async () => {
      mocks.openmaint.getIncidentWithTask.mockResolvedValueOnce({
        data: {
          ExecStartDate: null,
          _ProcessStatus_code: 'CM-Execution',
          _tasklist: [{ _id: 'TASK-123' }],
        },
      });

      const res = await request(app.getHttpServer())
        .post('/incidents/12345/start')
        .set('authorization', 'mock-session-id')
        .expect(201);

      expect(res.body.alreadyStarted).toBe(false);
      expect(mocks.openmaint.startIncident).toHaveBeenCalled();
    });

    it('es idempotente: si ya hay ExecStartDate no vuelve a escribir', async () => {
      mocks.openmaint.getIncidentWithTask.mockResolvedValueOnce({
        data: {
          ExecStartDate: '2026-08-27T09:00:00-05:00',
          _ProcessStatus_code: 'CM-Execution',
          _tasklist: [{ _id: 'TASK-123' }],
        },
      });

      const res = await request(app.getHttpServer())
        .post('/incidents/12345/start')
        .set('authorization', 'mock-session-id')
        .expect(201);

      expect(res.body.alreadyStarted).toBe(true);
      expect(mocks.openmaint.startIncident).not.toHaveBeenCalled();
    });

    it('400 si el correctivo no está en un estado iniciable (todavía en Assignment)', async () => {
      mocks.openmaint.getIncidentWithTask.mockResolvedValueOnce({
        data: {
          ExecStartDate: null,
          _ProcessStatus_code: 'CM-Assignment',
          _tasklist: [{ _id: 'TASK-123' }],
        },
      });

      await request(app.getHttpServer())
        .post('/incidents/12345/start')
        .set('authorization', 'mock-session-id')
        .expect(400);
    });
  });

  describe('POST /incidents/:id/complete', () => {
    it('cierra la incidencia cuando ya fue iniciada', async () => {
      mocks.openmaint.getIncidentWithTask.mockResolvedValueOnce({
        data: {
          ExecStartDate: '2026-08-27T09:00:00-05:00',
          _tasklist: [{ _id: 'TASK-123' }],
        },
      });

      const res = await request(app.getHttpServer())
        .post('/incidents/12345/complete')
        .set('authorization', 'mock-session-id')
        .send({ notes: 'Cerrado en prueba E2E' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(mocks.openmaint.getIncidentWithTask).toHaveBeenCalledWith(
        12345,
        'mock-session-id',
      );
      expect(mocks.openmaint.completeIncident).toHaveBeenCalled();
    });

    it('400 si el trabajo nunca se inició (sin ExecStartDate)', async () => {
      mocks.openmaint.getIncidentWithTask.mockResolvedValueOnce({
        data: { ExecStartDate: null, _tasklist: [{ _id: 'TASK-123' }] },
      });

      await request(app.getHttpServer())
        .post('/incidents/12345/complete')
        .set('authorization', 'mock-session-id')
        .send({ notes: 'No debería cerrar' })
        .expect(400);
    });

    it('400 si el archivo adjunto no es una imagen', async () => {
      mocks.openmaint.getIncidentWithTask.mockResolvedValueOnce({
        data: {
          ExecStartDate: '2026-08-27T09:00:00-05:00',
          _tasklist: [{ _id: 'TASK-123' }],
        },
      });

      await request(app.getHttpServer())
        .post('/incidents/12345/complete')
        .set('authorization', 'mock-session-id')
        .field('notes', 'Con adjunto inválido')
        .attach('file', Buffer.from('no es una imagen'), {
          filename: 'reporte.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });
  });

  describe('GET /incidents/:id', () => {
    it('devuelve el detalle de la incidencia', async () => {
      const res = await request(app.getHttpServer())
        .get('/incidents/12345')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('400 sin cabecera de autorización', async () => {
      await request(app.getHttpServer()).get('/incidents/12345').expect(400);
    });
  });

  describe('GET /incidents/my', () => {
    it('devuelve las incidencias del empleado autenticado', async () => {
      const res = await request(app.getHttpServer())
        .get('/incidents/my')
        .set('authorization', 'mock-session-id')
        .set('x-employee-id', '999')
        .expect(200);

      expect(Array.isArray(res.body.incidents)).toBe(true);
      expect(mocks.openmaint.getIncidentsByAssignee).toHaveBeenCalledWith(
        'mock-session-id',
        999,
      );
    });

    it('400 con x-employee-id no numérico', async () => {
      await request(app.getHttpServer())
        .get('/incidents/my')
        .set('authorization', 'mock-session-id')
        .set('x-employee-id', 'no-es-numero')
        .expect(400);
    });
  });

  describe('GET /incidents/reported', () => {
    it('devuelve los reportes del empleado con su estado estable', async () => {
      const res = await request(app.getHttpServer())
        .get('/incidents/reported')
        .set('authorization', 'mock-session-id')
        .set('x-employee-id', '999')
        .expect(200);

      expect(mocks.openmaint.getIncidentsByRequester).toHaveBeenCalledWith(
        'mock-session-id',
        999,
      );
      expect(res.body.incidents[0]).toMatchObject({
        id: 12346,
        statusCode: 'Assignment',
      });
      expect(res.body.incidents[0].updatedAt).toEqual(expect.any(String));
    });

    it('400 sin x-employee-id', async () => {
      await request(app.getHttpServer())
        .get('/incidents/reported')
        .set('authorization', 'mock-session-id')
        .expect(400);
    });
  });
});
