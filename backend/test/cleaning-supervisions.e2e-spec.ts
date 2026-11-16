import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession } from './mocks/openmaint-core.mock';
import { SUPERVISION_PHASE_IDS } from './mocks/gateways.mock';

/**
 * Supervisión posterior de limpieza (plan revisado el 14/11/2026).
 *
 * Catálogo del mock: LIM = Manchas (21) y Otro (29); MNT = Agua caliente (11).
 * Plantilla del mock: 3 puntos.
 */

const TOKEN = 'mock-session-token';
const TEMPLATE_ID = 11805251;
const OPERATOR_ID = 4567;

const CSV = [
  'area;guia_area;nombre_item;descripcion_criterio',
  'Dormitorios;Observa camas;Tendido de camas;Sábanas estiradas',
  'Dormitorios;Observa camas;"Polvo; superficies";Sin polvo',
  'Cocina;Observa la cocina;Vajilla;Limpia y guardada',
].join('\r\n');

const supervision = (overrides: Record<string, unknown> = {}) => ({
  _id: 5000,
  CleaningTask: 777,
  Unit: 300,
  _Unit_description: 'R302 - Estudio 02',
  Checklist: TEMPLATE_ID,
  Employee: null,
  Supervisor: null,
  _Phase_code: 'Draft',
  _Phase_description: 'Borrador',
  ...overrides,
});

const task = (overrides: Record<string, unknown> = {}) => ({
  _id: 777,
  _phase_description: 'Completed',
  phase: 'Completed',
  Unit: 300,
  TaskNumber: 'CT.2026.0001',
  ActualEndTime: '2026-12-05T15:00:00Z',
  Employee: OPERATOR_ID,
  _Employee_description: 'maria.lopez',
  ...overrides,
});

describe('CleaningSupervisionsController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  const asRole = (role: string) =>
    mocks.openmaint.getSession.mockResolvedValue(
      mockSession({ role, username: `${role}.mock` }),
    );

  const asOperator = () => {
    mocks.openmaint.getSession.mockResolvedValue(
      mockSession({ role: 'Team', username: 'operario.mock' }),
    );
    mocks.openmaint.resolveCleaningEmployeeId.mockResolvedValue(OPERATOR_ID);
  };

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  beforeEach(() => {
    asRole('SupervisorLimpieza');
    mocks.openmaint.resolveCleaningEmployeeId.mockResolvedValue(null);
    mocks.cleaningTasksOpenmaint.getCleaningActivity.mockResolvedValue({
      data: { _id: TEMPLATE_ID, Code: 'SUPERVISION', Plantilla: 'att-csv' },
    });
    mocks.cleaningTasksOpenmaint.downloadActivityTemplate.mockResolvedValue({
      data: Buffer.from(CSV, 'utf8'),
      contentType: 'text/csv',
      fileName: 'Book1.csv',
    });
    mocks.cleaningSupervisionsOpenmaint.findTemplateCard.mockResolvedValue({
      _id: TEMPLATE_ID,
      Code: 'SUPERVISION',
      Description: 'Supervision',
    });
    // Valores por defecto que algunos tests sustituyen: se restauran en cada
    // test para que un fallo a mitad no contamine a los siguientes.
    mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockReset();
    mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
      data: task(),
    });
    mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([]);
    mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(null);
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('acceso al panel', () => {
    it.each(['AsistenteSL', 'SuperUser', 'Coordinador'])(
      '403 en el panel para %s',
      async (role) => {
        asRole(role);

        await request(app.getHttpServer())
          .get('/cleaning-supervisions/template')
          .set('x-session-token', TOKEN)
          .expect(403);
      },
    );

    it('401 sin sesión', async () => {
      await request(app.getHttpServer())
        .get('/cleaning-supervisions/template')
        .expect(401);
    });
  });

  describe('GET /template', () => {
    it('devuelve las áreas y puntos del CSV, con comillas y punto y coma', async () => {
      const res = await request(app.getHttpServer())
        .get('/cleaning-supervisions/template')
        .set('x-session-token', TOKEN)
        .expect(200);

      expect(res.body.data.totalPoints).toBe(3);
      expect(res.body.data.areas.map((a) => a.name)).toEqual([
        'Dormitorios',
        'Cocina',
      ]);
      expect(res.body.data.areas[0].points[0]).toMatchObject({
        index: 1,
        name: 'Tendido de camas',
      });
      expect(res.body.data.areas[0].points[1].name).toBe('Polvo; superficies');
    });
  });

  describe('POST / (abrir o recuperar)', () => {
    const open = () =>
      request(app.getHttpServer())
        .post('/cleaning-supervisions')
        .set('x-session-token', TOKEN)
        .send({ taskId: 777 });

    it('reutiliza la supervisión abierta', async () => {
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task(),
      });
      mocks.cleaningSupervisionsOpenmaint.findByTask.mockResolvedValueOnce([
        supervision(),
      ]);

      const res = await open().expect(201);

      expect(res.body.data.id).toBe(5000);
      expect(
        mocks.cleaningSupervisionsOpenmaint.createSupervision,
      ).not.toHaveBeenCalled();
    });

    it('crea el borrador de una Completed sin supervisión', async () => {
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task(),
      });
      mocks.cleaningSupervisionsOpenmaint.createSupervision.mockResolvedValueOnce(
        supervision(),
      );

      await open().expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.createSupervision,
      ).toHaveBeenCalledWith({
        CleaningTask: 777,
        Phase: SUPERVISION_PHASE_IDS.Draft,
        Unit: 300,
        Checklist: TEMPLATE_ID,
      });
    });

    it('sin fecha de corte: una limpieza antigua también crea su borrador', async () => {
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task({ ActualEndTime: '2026-11-10T15:00:00Z' }),
      });
      mocks.cleaningSupervisionsOpenmaint.createSupervision.mockResolvedValueOnce(
        supervision(),
      );

      await open().expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.createSupervision,
      ).toHaveBeenCalledTimes(1);
    });

    it('400 sin fecha de fin: no crea nada ni anula borradores de la unidad', async () => {
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task({ ActualEndTime: null }),
      });

      await open().expect(400);

      expect(
        mocks.cleaningSupervisionsOpenmaint.createSupervision,
      ).not.toHaveBeenCalled();
    });

    it('409 superseded: la unidad tiene una limpieza más reciente', async () => {
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task(),
      });
      mocks.cleaningSupervisionsOpenmaint.findTasksByUnit.mockResolvedValueOnce(
        [
          task(),
          task({
            _id: 778,
            _phase_description: 'Completed',
            ActualEndTime: '2026-12-06T15:00:00Z',
          }),
        ],
      );

      const res = await open().expect(409);

      expect(res.body.reason).toBe('superseded');
    });

    it('409 reviewed: una limpieza revisada sin supervisión no crea otra', async () => {
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task({ _phase_description: 'Reviewed' }),
      });

      const res = await open().expect(409);

      expect(res.body.reason).toBe('reviewed');
    });

    it('al crear, anula el Draft anterior de la unidad pero no uno en corrección', async () => {
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockImplementation(
        (id: number) =>
          Promise.resolve({
            data:
              id === 777
                ? task()
                : task({ _id: id, ActualEndTime: '2026-12-02T15:00:00Z' }),
          }),
      );
      mocks.cleaningSupervisionsOpenmaint.createSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.findByUnit.mockResolvedValueOnce([
        supervision(),
        supervision({ _id: 4001, CleaningTask: 700, _Phase_code: 'Draft' }),
        supervision({
          _id: 4002,
          CleaningTask: 701,
          _Phase_code: 'InCorrection',
        }),
      ]);

      await open().expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledWith(4001, { Phase: SUPERVISION_PHASE_IDS.Cancelled });
    });
  });

  describe('POST /:id/start', () => {
    it('asigna como Supervisor la ficha InternalEmployee del usuario (LoginUser)', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.openmaint.resolveEmployeeId.mockResolvedValueOnce(9001);
      mocks.openmaint.getEmployeeCard.mockResolvedValueOnce({
        data: { _id: 9001, _type: 'InternalEmployee' },
      });

      await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/start')
        .set('x-session-token', TOKEN)
        .expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledWith(5000, { Supervisor: 9001 });
    });
  });

  describe('GET /:id · observaciones de la limpieza', () => {
    it('trae las de la coordinación y las del equipo, sin el borrador', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task({
          Observations: 'Revisar la terraza',
          TeamObservations:
            '[Pausado: 2026-12-05 | 10:20]: sin detergente\n[Reanudado: 2026-12-05 | 10:34]\nNota 1\nFalta un foco {texto a medias}',
        }),
      });

      const res = await request(app.getHttpServer())
        .get('/cleaning-supervisions/5000')
        .set('x-session-token', TOKEN)
        .expect(200);

      expect(res.body.data.task).toMatchObject({
        observations: 'Revisar la terraza',
        teamObservations:
          '[Pausado: 2026-12-05 | 10:20]: sin detergente\n[Reanudado: 2026-12-05 | 10:34]\nNota 1\nFalta un foco',
      });
    });
  });

  describe('GET /:id · tiempos de la limpieza', () => {
    it('trae inicio planeado y real, fin, tiempo trabajado y checkout', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task({
          PlannedStartTime: '2026-12-05T13:00:00Z',
          ActualStartTime: '2026-12-05T13:20:00Z',
          ExecutionTime: 85,
          CheckoutDate: '2026-12-05',
        }),
      });

      const res = await request(app.getHttpServer())
        .get('/cleaning-supervisions/5000')
        .set('x-session-token', TOKEN)
        .expect(200);

      expect(res.body.data.task).toMatchObject({
        plannedStartTime: '2026-12-05T13:00:00Z',
        actualStartTime: '2026-12-05T13:20:00Z',
        actualEndTime: '2026-12-05T15:00:00Z',
        executionTime: 85,
        checkoutDate: '2026-12-05',
      });
    });
  });

  describe('novedades', () => {
    const addFinding = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/findings')
        .set('x-session-token', TOKEN)
        .send(body);

    beforeEach(() => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
    });

    afterEach(() => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        null,
      );
    });

    it('201 guarda solo la novedad: punto, subcategoría LIM y observación', async () => {
      await addFinding({
        index: 2,
        subcategoryId: 21,
        observation: ' Polvo ',
      }).expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.createFinding,
      ).toHaveBeenCalledWith({
        Supervision: 5000,
        Index: 2,
        Subcategory: 21,
        Observation: 'Polvo',
        // Sin marcar: «resuelto por supervisor» se escribe en false.
        SolvedBySuperv: false,
      });
    });

    it('400 con «Otro» sin observación', async () => {
      await addFinding({ index: 1, subcategoryId: 29 }).expect(400);
    });

    it('400 con una subcategoría que no es de Limpieza', async () => {
      await addFinding({ index: 1, subcategoryId: 11 }).expect(400);
    });

    it('400 con un punto fuera del checklist', async () => {
      await addFinding({ index: 4, subcategoryId: 21 }).expect(400);
    });

    it('400 con observación de más de 500 caracteres', async () => {
      await addFinding({
        index: 1,
        subcategoryId: 21,
        observation: 'x'.repeat(501),
      }).expect(400);
    });

    it('400 si la supervisión ya no está en Draft', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision({ _Phase_code: 'InCorrection' }),
      );

      await addFinding({ index: 1, subcategoryId: 21 }).expect(400);
    });

    it('400 a la tercera foto de una novedad', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        { _id: 6000, Supervision: 5000, Index: 1, Subcategory: 21 },
      ]);
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValueOnce(
        [{ _id: 'a1' }, { _id: 'a2' }],
      );

      await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/findings/6000/photos')
        .set('x-session-token', TOKEN)
        .attach('file', Buffer.from('img'), {
          filename: 'foto.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);

      expect(
        mocks.cleaningSupervisionsOpenmaint.uploadFindingAttachment,
      ).not.toHaveBeenCalled();
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([]);
    });

    it('404 al borrar la foto de otra novedad', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValueOnce([
        { _id: 6000, Supervision: 5000 },
      ]);
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValueOnce(
        [{ _id: 'a1' }],
      );

      await request(app.getHttpServer())
        .delete('/cleaning-supervisions/5000/findings/6000/photos/ajena')
        .set('x-session-token', TOKEN)
        .expect(404);

      expect(
        mocks.cleaningSupervisionsOpenmaint.deleteFindingAttachment,
      ).not.toHaveBeenCalled();
    });
  });

  describe('POST /:id/assign', () => {
    const assign = (employeeId: number) =>
      request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/assign')
        .set('x-session-token', TOKEN)
        .send({ employeeId });

    it('asigna al operario del equipo, pasa a InCorrection y avisa', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        { _id: 6000, Supervision: 5000, Index: 1, Subcategory: 21 },
      ]);
      mocks.cleaningTasksOpenmaint.listEmployees.mockResolvedValueOnce({
        data: [{ _id: OPERATOR_ID, Description: 'maria.lopez' }],
      });

      const res = await assign(OPERATOR_ID).expect(201);

      expect(res.body.data.phase).toBe('InCorrection');
      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledWith(5000, {
        Employee: OPERATOR_ID,
        Phase: SUPERVISION_PHASE_IDS.InCorrection,
      });
      expect(
        mocks.pushDispatch.notifyCleaningCorrectionsAssigned,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          supervisionId: 5000,
          cleaningEmployeeId: OPERATOR_ID,
          findingsCount: 1,
        }),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([]);
    });

    it('400 con un operario fuera del equipo de limpieza', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValueOnce([
        { _id: 6000 },
      ]);
      mocks.cleaningTasksOpenmaint.listEmployees.mockResolvedValueOnce({
        data: [{ _id: 1 }],
      });

      await assign(OPERATOR_ID).expect(400);
    });

    it('400 sin novedades: se aprueba en su lugar', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );

      await assign(OPERATOR_ID).expect(400);
    });
  });

  describe('operario', () => {
    beforeEach(() => asOperator());

    it('GET /mine solo trae sus supervisiones InCorrection', async () => {
      mocks.cleaningSupervisionsOpenmaint.findByCorrector.mockResolvedValueOnce(
        [
          supervision({
            _id: 1,
            Employee: OPERATOR_ID,
            _Phase_code: 'InCorrection',
            _Supervisor_description: 'Rosa Quishpe',
          }),
          supervision({ _id: 2, Employee: OPERATOR_ID, _Phase_code: 'Fixed' }),
          supervision({ _id: 3, Employee: OPERATOR_ID, _Phase_code: 'Draft' }),
        ],
      );
      mocks.cleaningTasksOpenmaint.getUnitById.mockResolvedValueOnce({
        data: { Description: 'R302', _Building_description: 'Torre A' },
      });

      const res = await request(app.getHttpServer())
        .get('/cleaning-supervisions/mine')
        .set('x-session-token', TOKEN)
        .expect(200);

      expect(res.body.data.map((s) => s.id)).toEqual([1]);
      // Lo necesario para rotular la tarjeta del operario.
      expect(res.body.data[0]).toMatchObject({
        taskId: 777,
        taskNumber: 'CT.2026.0001',
        actualEndTime: '2026-12-05T15:00:00Z',
        unit: { id: 300, description: 'R302 - Estudio 02' },
        buildingName: 'Torre A',
        supervisor: 'Rosa Quishpe',
        findingsCount: 0,
      });
      expect(
        mocks.cleaningSupervisionsOpenmaint.findByCorrector,
      ).toHaveBeenCalledWith(OPERATOR_ID);
    });

    it('403 al ver la supervisión de otro operario', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision({ Employee: 1, _Phase_code: 'InCorrection' }),
      );

      await request(app.getHttpServer())
        .get('/cleaning-supervisions/5000')
        .set('x-session-token', TOKEN)
        .expect(403);
    });

    it('403 al ver la suya si no está InCorrection', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision({ Employee: OPERATOR_ID, _Phase_code: 'Draft' }),
      );

      await request(app.getHttpServer())
        .get('/cleaning-supervisions/5000')
        .set('x-session-token', TOKEN)
        .expect(403);
    });

    it('«Resuelto» pasa su supervisión a Fixed y avisa a SupervisorLimpieza', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision({ Employee: OPERATOR_ID, _Phase_code: 'InCorrection' }),
      );

      await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/fixed')
        .set('x-session-token', TOKEN)
        .expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledWith(5000, { Phase: SUPERVISION_PHASE_IDS.Fixed });
      expect(
        mocks.pushDispatch.notifyCleaningCorrectionsFixed,
      ).toHaveBeenCalledWith(expect.objectContaining({ supervisionId: 5000 }));
    });

    it('403 al pulsar «Resuelto» en una supervisión ajena', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision({ Employee: 1, _Phase_code: 'InCorrection' }),
      );

      await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/fixed')
        .set('x-session-token', TOKEN)
        .expect(403);
    });

    it('404 al descargar una foto que no está en la novedad', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision({ Employee: OPERATOR_ID, _Phase_code: 'InCorrection' }),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValueOnce([
        { _id: 6000, Supervision: 5000 },
      ]);
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValueOnce(
        [{ _id: 'a1' }],
      );

      await request(app.getHttpServer())
        .get(
          `/cleaning-supervisions/5000/findings/6000/attachments/otra/download?token=${TOKEN}`,
        )
        .expect(404);
    });
  });

  describe('fotos del arreglo (operario)', () => {
    const finding = {
      _id: 6000,
      Supervision: 5000,
      Index: 1,
      Subcategory: 21,
      SolvedBySuperv: false,
    };
    const mine = (overrides: Record<string, unknown> = {}) =>
      supervision({
        Employee: OPERATOR_ID,
        _Phase_code: 'InCorrection',
        ...overrides,
      });
    const upload = () =>
      request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/findings/6000/fix-photos')
        .set('x-session-token', TOKEN)
        .attach('file', Buffer.from('img'), {
          filename: 'foto.jpg',
          contentType: 'image/jpeg',
        });
    const remove = (attachmentId: string, path = 'fix-photos') =>
      request(app.getHttpServer())
        .delete(
          `/cleaning-supervisions/5000/findings/6000/${path}/${attachmentId}`,
        )
        .set('x-session-token', TOKEN);

    beforeEach(() => {
      asOperator();
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        mine(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        finding,
      ]);
    });

    afterEach(() => {
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [],
      );
    });

    it('sube la foto con el prefijo arr_ y la devuelve con su URL', async () => {
      const res = await upload().expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.uploadFindingAttachment,
      ).toHaveBeenCalledWith(
        6000,
        expect.anything(),
        expect.stringMatching(/^arr_/),
      );
      expect(res.body.data).toMatchObject({
        id: 'att-nov-1',
        downloadUrl:
          '/cleaning-supervisions/5000/findings/6000/attachments/att-nov-1/download',
      });
    });

    it('400 a la tercera foto del arreglo', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [
          { _id: 'f1', name: 'arr_1.jpg' },
          { _id: 'f2', name: 'arr_2.jpg' },
        ],
      );

      await upload().expect(400);

      expect(
        mocks.cleaningSupervisionsOpenmaint.uploadFindingAttachment,
      ).not.toHaveBeenCalled();
    });

    it('las fotos del supervisor no cuentan para el tope del arreglo', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [
          { _id: 'n1', name: 'nov_1.jpg' },
          { _id: 'n2', name: 'nov_2.jpg' },
        ],
      );

      await upload().expect(201);
    });

    it('403 en la supervisión de otro operario', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        mine({ Employee: 1 }),
      );

      await upload().expect(403);

      expect(
        mocks.cleaningSupervisionsOpenmaint.uploadFindingAttachment,
      ).not.toHaveBeenCalled();
    });

    it('400 si la supervisión ya no está en corrección', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        mine({ _Phase_code: 'Fixed' }),
      );

      await upload().expect(400);
    });

    it('400 si el supervisor ya resolvió la novedad', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        { ...finding, SolvedBySuperv: true },
      ]);

      await upload().expect(400);
    });

    it('403 si quien sube es el supervisor', async () => {
      asRole('SupervisorLimpieza');

      await upload().expect(403);

      expect(
        mocks.cleaningSupervisionsOpenmaint.uploadFindingAttachment,
      ).not.toHaveBeenCalled();
    });

    it('borra su propia foto del arreglo', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [{ _id: 'f1', name: 'arr_1.jpg' }],
      );

      await remove('f1').expect(200);

      expect(
        mocks.cleaningSupervisionsOpenmaint.deleteFindingAttachment,
      ).toHaveBeenCalledWith(6000, 'f1');
    });

    it('403 al borrar por esta ruta una foto del supervisor', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [{ _id: 'n1', name: 'nov_1.jpg' }],
      );

      await remove('n1').expect(403);

      expect(
        mocks.cleaningSupervisionsOpenmaint.deleteFindingAttachment,
      ).not.toHaveBeenCalled();
    });

    it('el supervisor no borra una foto del arreglo', async () => {
      asRole('SupervisorLimpieza');
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [{ _id: 'f1', name: 'arr_1.jpg' }],
      );

      await remove('f1', 'photos').expect(403);

      expect(
        mocks.cleaningSupervisionsOpenmaint.deleteFindingAttachment,
      ).not.toHaveBeenCalled();
    });

    it('el operario ve la foto del arreglo que subió', async () => {
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [{ _id: 'f1', name: 'arr_1.jpg' }],
      );

      await request(app.getHttpServer())
        .get(
          '/cleaning-supervisions/5000/findings/6000/attachments/f1/download',
        )
        .set('x-session-token', TOKEN)
        .expect(200);
    });

    it('el detalle separa las fotos de la novedad de las del arreglo', async () => {
      asRole('SupervisorLimpieza');
      mocks.cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue(
        [
          { _id: 'n1', name: 'nov_1.jpg' },
          { _id: 'f1', name: 'arr_1.jpg' },
        ],
      );

      const res = await request(app.getHttpServer())
        .get('/cleaning-supervisions/5000')
        .set('x-session-token', TOKEN)
        .expect(200);

      const [first] = res.body.data.findings;
      expect(first.photos.map((p) => p.id)).toEqual(['n1']);
      expect(first.fixPhotos.map((p) => p.id)).toEqual(['f1']);
    });
  });

  describe('POST /:id/approve', () => {
    const approve = () =>
      request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/approve')
        .set('x-session-token', TOKEN);

    it('Confirmed: primero la limpieza a Reviewed y después la supervisión a Approved', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision({ _Phase_code: 'Confirmed' }),
      );
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task(),
      });

      await approve().expect(201);

      expect(
        mocks.cleaningTasksOpenmaint.updateCleaningTask,
      ).toHaveBeenCalledWith(777, { phase: 2216404 });
      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledWith(5000, { Phase: SUPERVISION_PHASE_IDS.Approved });
      const taskOrder =
        mocks.cleaningTasksOpenmaint.updateCleaningTask.mock
          .invocationCallOrder[0];
      const supervisionOrder =
        mocks.cleaningSupervisionsOpenmaint.updateSupervision.mock
          .invocationCallOrder[0];
      expect(taskOrder).toBeLessThan(supervisionOrder);
    });

    it('reintento: con la limpieza ya Reviewed solo completa la supervisión', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision({ _Phase_code: 'Confirmed' }),
      );
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task({ _phase_description: 'Reviewed' }),
      });

      await approve().expect(201);

      expect(
        mocks.cleaningTasksOpenmaint.updateCleaningTask,
      ).not.toHaveBeenCalled();
      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledWith(5000, { Phase: SUPERVISION_PHASE_IDS.Approved });
    });

    it('Draft sin novedades: aprueba directo', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
        data: task(),
      });

      await approve().expect(201);
    });

    it('400 en Draft con novedades sin corregir', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValueOnce(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValueOnce([
        { _id: 6000 },
      ]);

      await approve().expect(400);
      expect(
        mocks.cleaningTasksOpenmaint.updateCleaningTask,
      ).not.toHaveBeenCalled();
    });
  });

  describe('resuelto por el supervisor', () => {
    const resolved = {
      _id: 6001,
      Supervision: 5000,
      Index: 1,
      Subcategory: 21,
      SolvedBySuperv: true,
    };
    const pending = {
      _id: 6002,
      Supervision: 5000,
      Index: 2,
      Subcategory: 21,
      SolvedBySuperv: false,
    };

    it('crear marcada escribe SolvedBySuperv: true', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );

      const res = await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/findings')
        .set('x-session-token', TOKEN)
        .send({ index: 1, subcategoryId: 21, resolvedBySupervisor: true })
        .expect(201);

      expect(res.body.data.resolvedBySupervisor).toBe(true);
      expect(
        mocks.cleaningSupervisionsOpenmaint.createFinding,
      ).toHaveBeenCalledWith(expect.objectContaining({ SolvedBySuperv: true }));
    });

    it('crear sin marcar escribe SolvedBySuperv: false', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );

      const res = await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/findings')
        .set('x-session-token', TOKEN)
        .send({ index: 1, subcategoryId: 21 })
        .expect(201);

      expect(res.body.data.resolvedBySupervisor).toBe(false);
      expect(
        mocks.cleaningSupervisionsOpenmaint.createFinding,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ SolvedBySuperv: false }),
      );
    });

    it('desmarcar escribe false y no toca el resto', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        { ...resolved, Observation: 'Mancha' },
      ]);

      await request(app.getHttpServer())
        .patch('/cleaning-supervisions/5000/findings/6001')
        .set('x-session-token', TOKEN)
        .send({ resolvedBySupervisor: false })
        .expect(200);

      expect(
        mocks.cleaningSupervisionsOpenmaint.updateFinding,
      ).toHaveBeenCalledWith(6001, {
        Index: 1,
        Subcategory: 21,
        Observation: 'Mancha',
        SolvedBySuperv: false,
      });
    });

    it('editar sin mandar la marca la conserva', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        resolved,
      ]);

      const res = await request(app.getHttpServer())
        .patch('/cleaning-supervisions/5000/findings/6001')
        .set('x-session-token', TOKEN)
        .send({ observation: 'Otra' })
        .expect(200);

      expect(res.body.data.resolvedBySupervisor).toBe(true);
      expect(
        mocks.cleaningSupervisionsOpenmaint.updateFinding.mock.calls[0][1],
      ).not.toHaveProperty('SolvedBySuperv');
    });

    it('400 al asignar si todas están resueltas', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        resolved,
      ]);

      await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/assign')
        .set('x-session-token', TOKEN)
        .send({ employeeId: OPERATOR_ID })
        .expect(400);
    });

    it('el aviso al asignar cuenta solo las pendientes', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        resolved,
        pending,
      ]);
      mocks.cleaningTasksOpenmaint.listEmployees.mockResolvedValueOnce({
        data: [{ _id: OPERATOR_ID, Description: 'maria.lopez' }],
      });

      await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/assign')
        .set('x-session-token', TOKEN)
        .send({ employeeId: OPERATOR_ID })
        .expect(201);

      expect(
        mocks.pushDispatch.notifyCleaningCorrectionsAssigned,
      ).toHaveBeenCalledWith(expect.objectContaining({ findingsCount: 1 }));
    });

    it('aprueba desde el borrador si solo hay novedades resueltas', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        resolved,
      ]);

      await request(app.getHttpServer())
        .post('/cleaning-supervisions/5000/approve')
        .set('x-session-token', TOKEN)
        .expect(201);

      expect(
        mocks.cleaningSupervisionsOpenmaint.updateSupervision,
      ).toHaveBeenCalledWith(5000, { Phase: SUPERVISION_PHASE_IDS.Approved });
    });

    it('el operario no ve las resueltas, ni en el detalle ni en mine', async () => {
      asOperator();
      const mineSupervision = supervision({
        Employee: OPERATOR_ID,
        _Phase_code: 'InCorrection',
      });
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        mineSupervision,
      );
      mocks.cleaningSupervisionsOpenmaint.findByCorrector.mockResolvedValueOnce(
        [mineSupervision],
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        resolved,
        pending,
      ]);

      const detail = await request(app.getHttpServer())
        .get('/cleaning-supervisions/5000')
        .set('x-session-token', TOKEN)
        .expect(200);
      expect(detail.body.data.findings.map((f) => f.id)).toEqual([6002]);

      const mine = await request(app.getHttpServer())
        .get('/cleaning-supervisions/mine')
        .set('x-session-token', TOKEN)
        .expect(200);
      expect(mine.body.data[0].findingsCount).toBe(1);
    });

    it('SupervisorLimpieza ve todas, con la marca', async () => {
      mocks.cleaningSupervisionsOpenmaint.getSupervision.mockResolvedValue(
        supervision(),
      );
      mocks.cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
        resolved,
        pending,
      ]);

      const res = await request(app.getHttpServer())
        .get('/cleaning-supervisions/5000')
        .set('x-session-token', TOKEN)
        .expect(200);

      expect(
        res.body.data.findings.map((f) => [f.id, f.resolvedBySupervisor]),
      ).toEqual([
        [6001, true],
        [6002, false],
      ]);
      expect(res.body.data.can.approve).toBe(false);
      expect(res.body.data.can.assign).toBe(true);
    });
  });
});
