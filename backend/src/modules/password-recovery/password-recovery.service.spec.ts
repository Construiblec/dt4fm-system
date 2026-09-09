import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../notifications/mail/mailer.service';
import {
  PasswordRecoveryOpenmaintService,
  type OpenmaintUserAccount,
  type OpenmaintUserCard,
} from './password-recovery.openmaint.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { ResetTokenService } from './reset-token.service';

const SESSION_ID = 'session-de-servicio';
const USER_ID = 1456092;
const PASSWORD_HASH = 'hash-actual';

const userCard = (
  overrides: Partial<OpenmaintUserCard> = {},
): OpenmaintUserCard => ({
  _id: USER_ID,
  Username: 'raul.ontaneda',
  Email: 'raul@construiblec.cloud',
  Password: PASSWORD_HASH,
  Active: true,
  Service: false,
  ...overrides,
});

/** Cuenta con tres grupos: el caso que la implementación no debe pisar. */
const account = (): OpenmaintUserAccount => ({
  _id: USER_ID,
  username: 'raul.ontaneda',
  description: 'Raul Ontaneda',
  email: 'raul@construiblec.cloud',
  active: true,
  defaultUserGroup: 261340,
  userGroups: [
    { _id: 261342, name: 'Guest' },
    { _id: 261340, name: 'MaintOffice' },
    { _id: 261344, name: 'Team' },
  ],
});

const buildHarness = () => {
  const openmaint = {
    getServiceSessionId: jest.fn().mockResolvedValue(SESSION_ID),
    findUsers: jest.fn().mockResolvedValue([userCard()]),
    getUserCard: jest.fn().mockResolvedValue(userCard()),
    getUserAccount: jest.fn().mockResolvedValue(account()),
    updatePassword: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PasswordRecoveryOpenmaintService>;

  const mailer = {
    sendOne: jest.fn().mockResolvedValue({ to: 'x', success: true }),
  } as unknown as jest.Mocked<MailerService>;

  const tokenService = new ResetTokenService({
    get: () => 'secreto-de-pruebas',
  } as unknown as ConfigService);

  const config = {
    get: (key: string) =>
      key === 'APP_BASE_URL' ? 'https://app.construiblec.cloud' : undefined,
  } as unknown as ConfigService;

  const service = new PasswordRecoveryService(
    openmaint,
    tokenService,
    mailer,
    config,
  );

  return { service, openmaint, mailer, tokenService };
};

describe('PasswordRecoveryService', () => {
  describe('requestReset', () => {
    it('envía el enlace y no filtra el token en el asunto', async () => {
      const { service, mailer } = buildHarness();

      await service.requestReset('raul.ontaneda');

      expect(mailer.sendOne).toHaveBeenCalledTimes(1);
      const mensaje = mailer.sendOne.mock.calls[0][0];
      expect(mensaje.to).toBe('raul@construiblec.cloud');
      expect(mensaje.html).toContain(
        'https://app.construiblec.cloud/reset-password?token=',
      );
    });

    it('responde igual cuando la cuenta no existe', async () => {
      const { service, openmaint, mailer } = buildHarness();
      openmaint.findUsers.mockResolvedValue([]);

      const existente =
        await buildHarness().service.requestReset('raul.ontaneda');
      const inexistente = await service.requestReset('no.existe');

      expect(inexistente).toEqual(existente);
      expect(mailer.sendOne).not.toHaveBeenCalled();
    });

    it('no envía nada si el usuario no tiene correo', async () => {
      const { service, openmaint, mailer } = buildHarness();
      openmaint.findUsers.mockResolvedValue([userCard({ Email: null })]);

      await service.requestReset('raul.ontaneda');

      expect(mailer.sendOne).not.toHaveBeenCalled();
    });

    it('omite cuentas inactivas y de servicio', async () => {
      const { service, openmaint, mailer } = buildHarness();
      openmaint.findUsers.mockResolvedValue([
        userCard({ Active: false }),
        userCard({ _id: 999, Service: true }),
      ]);

      await service.requestReset('raul.ontaneda');

      expect(mailer.sendOne).not.toHaveBeenCalled();
    });

    it('ante un correo compartido por dos cuentas, exige coincidencia exacta de usuario', async () => {
      const { service, openmaint, mailer } = buildHarness();
      const compartido = 'erazoestiven1@gmail.com';
      openmaint.findUsers.mockResolvedValue([
        userCard({ Username: 'usuario.prueba', Email: compartido }),
        userCard({
          _id: 2430770,
          Username: 'usuario.invitado',
          Email: compartido,
        }),
      ]);

      // Buscando por el correo compartido no se puede decidir: no se envía.
      await service.requestReset(compartido);
      expect(mailer.sendOne).not.toHaveBeenCalled();

      // Buscando por el usuario exacto sí.
      await service.requestReset('usuario.prueba');
      expect(mailer.sendOne).toHaveBeenCalledTimes(1);
    });

    it('responde genéricamente aunque openMAINT falle', async () => {
      const { service, openmaint } = buildHarness();
      openmaint.getServiceSessionId.mockRejectedValue(
        new Error('openMAINT caído'),
      );

      await expect(service.requestReset('raul.ontaneda')).resolves.toEqual(
        service.genericResponse(),
      );
    });
  });

  describe('resetPassword', () => {
    const tokenValido = () => {
      const { service, openmaint, mailer, tokenService } = buildHarness();
      return {
        service,
        openmaint,
        mailer,
        token: tokenService.create(USER_ID, PASSWORD_HASH),
      };
    };

    it('conserva los grupos del usuario al cambiar la contraseña', async () => {
      const { service, openmaint, token } = tokenValido();

      await service.resetPassword(token, 'ClaveNueva2026.');

      expect(openmaint.updatePassword).toHaveBeenCalledTimes(1);
      const [cuenta, clave] = openmaint.updatePassword.mock.calls[0];
      expect(clave).toBe('ClaveNueva2026.');
      // El bug a evitar: reemplazar los grupos por uno fijo.
      expect(cuenta.userGroups).toHaveLength(3);
      expect(cuenta.userGroups?.map((g) => g.name)).toEqual([
        'Guest',
        'MaintOffice',
        'Team',
      ]);
      expect(cuenta.defaultUserGroup).toBe(261340);
    });

    it('rechaza un token ya usado', async () => {
      const { service, openmaint, token } = tokenValido();

      await service.resetPassword(token, 'ClaveNueva2026.');

      // Tras el cambio, openMAINT devuelve otro hash y la firma ya no cuadra.
      openmaint.getUserCard.mockResolvedValue(
        userCard({ Password: 'hash-nuevo' }),
      );

      await expect(
        service.resetPassword(token, 'OtraClave2026.'),
      ).rejects.toThrow(BadRequestException);
      expect(openmaint.updatePassword).toHaveBeenCalledTimes(1);
    });

    it('rechaza un token inventado', async () => {
      const { service, openmaint } = buildHarness();

      await expect(
        service.resetPassword('token.falso', 'ClaveNueva2026.'),
      ).rejects.toThrow(BadRequestException);
      expect(openmaint.updatePassword).not.toHaveBeenCalled();
    });

    it('rechaza si la cuenta quedó inactiva', async () => {
      const { service, openmaint, token } = tokenValido();
      openmaint.getUserCard.mockResolvedValue(userCard({ Active: false }));

      await expect(
        service.resetPassword(token, 'ClaveNueva2026.'),
      ).rejects.toThrow(BadRequestException);
      expect(openmaint.updatePassword).not.toHaveBeenCalled();
    });
  });
});
