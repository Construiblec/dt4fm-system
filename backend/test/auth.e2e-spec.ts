import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession } from './mocks/openmaint-core.mock';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('POST /auth/login', () => {
    it('201: credenciales válidas devuelven la sesión resuelta', async () => {
      mocks.openmaintAuth.login.mockResolvedValueOnce({
        data: mockSession({
          availableRoles: ['MaintOffice', 'SupervisorLimpieza'],
        }),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'tecnico.mock', password: 'password123' })
        .expect(201);

      expect(res.body.sessionId).toBe('mock-session-id');
      expect(res.body.availableRoles).toEqual([
        'MaintOffice',
        'SupervisorLimpieza',
      ]);
      expect(res.body.employeeId).toBe(4567);
    });

    it('401 con credenciales incorrectas', async () => {
      mocks.openmaintAuth.login.mockRejectedValueOnce({
        response: { status: 401 },
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'tecnico.mock', password: 'mala-clave' })
        .expect(401);
    });

    it('400 si falta el username', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'password123' })
        .expect(400);
    });
  });

  describe('POST /auth/role', () => {
    it('201: cambia el rol activo cuando pertenece a availableRoles', async () => {
      mocks.openmaintAuth.getSession.mockResolvedValueOnce({
        data: mockSession({
          availableRoles: ['MaintOffice', 'SupervisorLimpieza'],
        }),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/role')
        .set('authorization', 'mock-session-id')
        .send({ role: 'SupervisorLimpieza' })
        .expect(201);

      expect(mocks.openmaintAuth.setSessionRole).toHaveBeenCalledWith(
        'mock-session-id',
        'SupervisorLimpieza',
      );
      expect(res.body.role).toBe('SupervisorLimpieza');
    });

    it('401 si el rol pedido no está entre los disponibles', async () => {
      mocks.openmaintAuth.getSession.mockResolvedValueOnce({
        data: mockSession({ availableRoles: ['MaintOffice'] }),
      });

      await request(app.getHttpServer())
        .post('/auth/role')
        .set('authorization', 'mock-session-id')
        .send({ role: 'SuperUser' })
        .expect(401);

      expect(mocks.openmaintAuth.setSessionRole).not.toHaveBeenCalled();
    });

    it('401 al intentar cambiar al rol Propietarios (no permitido)', async () => {
      mocks.openmaintAuth.getSession.mockResolvedValueOnce({
        data: mockSession({ availableRoles: ['MaintOffice', 'Propietarios'] }),
      });

      await request(app.getHttpServer())
        .post('/auth/role')
        .set('authorization', 'mock-session-id')
        .send({ role: 'Propietarios' })
        .expect(401);
    });
  });

  describe('PUT /auth/password', () => {
    it('200: cambia la contraseña con la actual correcta', async () => {
      mocks.openmaintAuth.getSession.mockResolvedValueOnce({
        data: mockSession(),
      });
      mocks.openmaintAuth.login.mockResolvedValueOnce({ data: mockSession() });

      const res = await request(app.getHttpServer())
        .put('/auth/password')
        .set('authorization', 'mock-session-id')
        .send({
          currentPassword: 'password123',
          newPassword: 'nuevaClaveSegura',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('400 si la contraseña nueva tiene menos de 8 caracteres', async () => {
      await request(app.getHttpServer())
        .put('/auth/password')
        .set('authorization', 'mock-session-id')
        .send({ currentPassword: 'password123', newPassword: 'corta' })
        .expect(400);
    });

    it('400 si la contraseña actual es incorrecta', async () => {
      mocks.openmaintAuth.getSession.mockResolvedValueOnce({
        data: mockSession(),
      });
      mocks.openmaintAuth.login.mockRejectedValueOnce(
        new Error('credenciales inválidas'),
      );

      await request(app.getHttpServer())
        .put('/auth/password')
        .set('authorization', 'mock-session-id')
        .send({
          currentPassword: 'mala-clave',
          newPassword: 'nuevaClaveSegura',
        })
        .expect(400);
    });
  });
});
