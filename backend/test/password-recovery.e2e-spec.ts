import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { ResetTokenService } from '../src/modules/password-recovery/reset-token.service';

const GENERIC_MESSAGE =
  'Si la cuenta existe y tiene un correo registrado, enviaremos un enlace ' +
  'para restablecer la contraseña.';

describe('PasswordRecoveryController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let tokenService: ResetTokenService;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    tokenService = app.get(ResetTokenService);
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  describe('POST /auth/forgot-password', () => {
    it('200 con el mensaje genérico cuando la cuenta existe', async () => {
      mocks.passwordRecoveryOpenmaint.findUsers.mockResolvedValueOnce([
        {
          _id: 42,
          Username: 'raul.ontaneda',
          Email: 'raul@example.com',
          Active: true,
          Service: false,
          Password: 'hash-actual',
        },
      ]);

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ usernameOrEmail: 'raul.ontaneda' })
        .expect(200);

      expect(res.body.message).toBe(GENERIC_MESSAGE);
      expect(mocks.mailer.sendOne).toHaveBeenCalled();
    });

    it('200 con el MISMO mensaje genérico cuando la cuenta no existe', async () => {
      mocks.passwordRecoveryOpenmaint.findUsers.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ usernameOrEmail: 'no-existe' })
        .expect(200);

      expect(res.body.message).toBe(GENERIC_MESSAGE);
      expect(mocks.mailer.sendOne).not.toHaveBeenCalled();
    });

    it('400 si usernameOrEmail es demasiado corto', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ usernameOrEmail: 'ab' })
        .expect(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('200: token válido y firmado con el hash correcto restablece la contraseña', async () => {
      const token = tokenService.create(42, 'hash-actual');
      mocks.passwordRecoveryOpenmaint.getUserCard.mockResolvedValueOnce({
        _id: 42,
        Password: 'hash-actual',
        Active: true,
        Service: false,
      });
      mocks.passwordRecoveryOpenmaint.getUserAccount.mockResolvedValueOnce({
        _id: 42,
        username: 'raul.ontaneda',
      });

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'MiClaveSegura2026.' })
        .expect(200);

      expect(res.body.message).toBe(
        'Tu contraseña se actualizó correctamente.',
      );
      expect(mocks.passwordRecoveryOpenmaint.updatePassword).toHaveBeenCalled();
    });

    it('400 con un token cuya firma no coincide con el hash actual (ya usado)', async () => {
      const token = tokenService.create(42, 'hash-viejo');
      mocks.passwordRecoveryOpenmaint.getUserCard.mockResolvedValueOnce({
        _id: 42,
        // La contraseña YA cambió: el hash actual no es con el que se firmó.
        Password: 'hash-nuevo',
        Active: true,
        Service: false,
      });

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'MiClaveSegura2026.' })
        .expect(400);
    });

    it('400 con un token corrupto', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          token: 'esto-no-es-un-token-valido',
          newPassword: 'MiClaveSegura2026.',
        })
        .expect(400);
    });

    it('400 si la contraseña nueva tiene menos de 8 caracteres', async () => {
      const token = tokenService.create(42, 'hash-actual');

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, newPassword: 'corta' })
        .expect(400);
    });
  });
});
