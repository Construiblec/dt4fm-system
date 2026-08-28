import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';

describe('BuildingsController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('GET /buildings', () => {
    it('devuelve el listado de edificios', async () => {
      mocks.openmaint.getBuildings.mockResolvedValueOnce({
        data: [
          { _id: 100, Code: 'ED-1', Name: 'Torre A', Description: 'Torre A' },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/buildings')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(res.body).toEqual([
        { id: 100, code: 'ED-1', name: 'Torre A', description: 'Torre A' },
      ]);
    });
  });

  describe('GET /buildings/:buildingId/locations', () => {
    it('agrupa unidades y áreas comunes por planta', async () => {
      mocks.openmaint.getFloorsByBuilding.mockResolvedValueOnce({
        data: [{ _id: 1, Code: 'P1', Name: 'Piso 1', Description: null }],
      });
      mocks.openmaint.getUnitsByBuilding.mockResolvedValueOnce({
        data: [{ _id: 10, Code: 'U-101', Name: 'Unidad 101', Floor: 1 }],
      });
      mocks.openmaint.getCommonAreasByBuilding.mockResolvedValueOnce({
        data: [{ _id: 20, Code: 'SUM', Name: 'Salón comunal', Floor: null }],
      });

      const res = await request(app.getHttpServer())
        .get('/buildings/100/locations')
        .set('authorization', 'mock-session-id')
        .expect(200);

      expect(res.body.buildingId).toBe(100);
      expect(res.body.floors).toHaveLength(1);
      expect(res.body.floors[0].areas).toHaveLength(1);
      expect(res.body.floors[0].areas[0].id).toBe(10);
      expect(res.body.unassignedAreas).toHaveLength(1);
      expect(res.body.unassignedAreas[0].id).toBe(20);
    });

    it('400 si :buildingId no es numérico', async () => {
      await request(app.getHttpServer())
        .get('/buildings/no-es-numero/locations')
        .set('authorization', 'mock-session-id')
        .expect(400);
    });

    it('400 sin cabecera de autorización', async () => {
      await request(app.getHttpServer())
        .get('/buildings/100/locations')
        .expect(400);
    });

    it('401 cuando openMAINT devuelve sesión expirada', async () => {
      mocks.openmaint.getFloorsByBuilding.mockRejectedValueOnce({
        response: { status: 401 },
      });
      mocks.openmaint.getUnitsByBuilding.mockResolvedValueOnce({ data: [] });
      mocks.openmaint.getCommonAreasByBuilding.mockResolvedValueOnce({
        data: [],
      });

      await request(app.getHttpServer())
        .get('/buildings/100/locations')
        .set('authorization', 'mock-session-id')
        .expect(401);
    });

    it('502 ante cualquier otro error de openMAINT', async () => {
      mocks.openmaint.getFloorsByBuilding.mockRejectedValueOnce(
        new Error('boom'),
      );
      mocks.openmaint.getUnitsByBuilding.mockResolvedValueOnce({ data: [] });
      mocks.openmaint.getCommonAreasByBuilding.mockResolvedValueOnce({
        data: [],
      });

      await request(app.getHttpServer())
        .get('/buildings/100/locations')
        .set('authorization', 'mock-session-id')
        .expect(502);
    });
  });
});
