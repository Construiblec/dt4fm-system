import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { OpenmaintService } from '../src/integrations/openmaint/openmaint.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { mockOpenmaintService } from './mocks/openmaint.service.mock';
import { mockNotificationsService } from './mocks/notifications.service.mock';

describe('IncidentsController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OpenmaintService)
      .useValue(mockOpenmaintService)
      .overrideProvider(NotificationsService)
      .useValue(mockNotificationsService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /incidents', () => {
    it('debería crear una incidencia y retornar el incidentId mockeado', () => {
      return request(app.getHttpServer())
        .post('/incidents')
        .set('authorization', 'mock-session-id')
        .set('x-employee-id', '999')
        .send({
          buildingId: 100,
          floorArea: 'Piso 1',
          priority: 1,
          notes: 'Prueba E2E de creación',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.incidentId).toBe(12345);
          expect(res.body.requester).toBe(999);
          expect(
            mockOpenmaintService.createCorrectiveMaintIncident,
          ).toHaveBeenCalled();
          expect(
            mockNotificationsService.notifyIncidentCreated,
          ).toHaveBeenCalled();
        });
    });

    it('debería fallar si faltan cabeceras obligatorias', () => {
      return request(app.getHttpServer())
        .post('/incidents')
        .send({
          buildingId: 100,
          floorArea: 'Piso 1',
          priority: 1,
          notes: 'Prueba sin headers',
        })
        .expect(400);
    });
  });

  describe('POST /incidents/:id/complete', () => {
    it('debería cerrar la incidencia exitosamente', () => {
      return request(app.getHttpServer())
        .post('/incidents/12345/complete')
        .set('authorization', 'mock-session-id')
        .send({
          notes: 'Cerrado en prueba E2E',
        })
        .expect(201) // NestJS POST devuelve 201 por defecto a menos que se cambie con @HttpCode
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(mockOpenmaintService.getIncidentWithTask).toHaveBeenCalledWith(
            12345,
            'mock-session-id',
          );
          expect(mockOpenmaintService.completeIncident).toHaveBeenCalled();
        });
    });
  });
});
