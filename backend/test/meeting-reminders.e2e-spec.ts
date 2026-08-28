import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession } from './mocks/openmaint-core.mock';

describe('MeetingRemindersController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  it('200: dryRun calcula destinatarios coincidentes sin enviar correo', async () => {
    mocks.openmaintAuth.login.mockResolvedValue({ data: mockSession() });
    mocks.openmaintClient.get.mockImplementation((path: string) => {
      if (path.includes('/classes/Reuniones/')) {
        return Promise.resolve({
          data: [
            {
              _id: 1,
              Description: 'Asamblea',
              FechaDeReunion: new Date().toISOString(),
              Asunto: 'Asamblea general',
              Edificio: 100,
              _Edificio_description: 'Torre A',
              TipoDeArrendatario: 5,
              _TipoDeArrendatario_description: 'Propietario',
            },
          ],
        });
      }
      if (path.includes('/classes/Tenant/')) {
        return Promise.resolve({
          data: [
            {
              _id: 900,
              Description: 'Juan Perez',
              Email: 'juan@example.com',
              Edficio: 100,
              OccupancyType: 5,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const res = await request(app.getHttpServer())
      .post('/meeting-reminders/run?days=0&dryRun=true')
      .expect(200);

    expect(res.body.meetingsMatched).toBe(1);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.details[0].recipients).toContain('juan@example.com');
    expect(mocks.mailer.sendBulk).not.toHaveBeenCalled();
  });

  it('200 con meetingsMatched:0 cuando ninguna reunión cae en la ventana', async () => {
    mocks.openmaintAuth.login.mockResolvedValue({ data: mockSession() });
    mocks.openmaintClient.get.mockResolvedValueOnce({ data: [] });

    const res = await request(app.getHttpServer())
      .post('/meeting-reminders/run?days=3&dryRun=true')
      .expect(200);

    expect(res.body.meetingsMatched).toBe(0);
  });

  it('400 si days no es un entero', async () => {
    await request(app.getHttpServer())
      .post('/meeting-reminders/run?days=no-es-numero')
      .expect(400);
  });
});
