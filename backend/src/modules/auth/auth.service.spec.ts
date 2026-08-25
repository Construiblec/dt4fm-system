import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OpenmaintAuthService,
  type OpenmaintSession,
} from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintRolesService } from '../../integrations/openmaint/openmaint.roles.service';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import {
  OpenmaintUsersService,
  type OpenmaintUserAccount,
} from '../../integrations/openmaint/openmaint.users.service';
import { AuthService } from './auth.service';

const SESSION_ID = 'sesion-del-usuario';
const SERVICE_SESSION_ID = 'sesion-de-servicio';
const USER_ID = 453364;

/** Cuenta multi-rol: es el caso que motiva todo este módulo. */
const multiRole = (overrides: Partial<OpenmaintSession> = {}) =>
  ({
    _id: SESSION_ID,
    username: 'pamela.calo',
    userId: USER_ID,
    userDescription: 'Asistente BIM-FM',
    role: 'MaintOffice',
    availableRoles: ['MaintOffice', 'SupervisorLimpieza', 'Propietarios'],
    ...overrides,
  }) as OpenmaintSession;

/** Cuenta con un solo grupo: el login no debe ofrecer elegir. */
const singleRole = () =>
  multiRole({ role: 'Supplier', availableRoles: ['Supplier'] });

const account = (): OpenmaintUserAccount => ({
  _id: USER_ID,
  username: 'pamela.calo',
  description: 'Asistente BIM-FM',
  email: 'pamela@construiblec.cloud',
  active: true,
  defaultUserGroup: 261340,
  userGroups: [
    { _id: 261340, name: 'MaintOffice' },
    { _id: 6824850, name: 'SupervisorLimpieza' },
    { _id: 3361541, name: 'Propietarios' },
  ],
});

const buildHarness = (session: OpenmaintSession = multiRole()) => {
  const auth = {
    login: jest.fn().mockResolvedValue({ data: session }),
    getSession: jest.fn().mockResolvedValue({ data: session }),
    setSessionRole: jest.fn().mockResolvedValue({ data: session }),
  } as unknown as jest.Mocked<OpenmaintAuthService>;

  const openmaint = {
    resolveEmployeeId: jest.fn().mockResolvedValue(777),
    resolveCleaningEmployeeId: jest.fn().mockResolvedValue(888),
    findTenantByDescription: jest.fn().mockResolvedValue(999),
  } as unknown as jest.Mocked<OpenmaintService>;

  const serviceSession = {
    get: jest.fn().mockResolvedValue(SERVICE_SESSION_ID),
  } as unknown as jest.Mocked<OpenmaintServiceSession>;

  const users = {
    getAccount: jest.fn().mockResolvedValue(account()),
    updatePassword: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OpenmaintUsersService>;

  const roles = {
    getLabels: jest.fn().mockResolvedValue({
      MaintOffice: 'TPM Equipment',
      SupervisorLimpieza: 'Supervisor Limpieza',
      Propietarios: 'Propietarios',
    }),
  } as unknown as jest.Mocked<OpenmaintRolesService>;

  const service = new AuthService(
    auth,
    openmaint,
    serviceSession,
    users,
    roles,
  );

  return { service, auth, openmaint, serviceSession, users, roles };
};

/** Error tal y como lo re-lanza OpenmaintClient: un AxiosError crudo. */
const axiosError = (status: number) =>
  Object.assign(new Error('Request failed'), { response: { status } });

describe('AuthService', () => {
  describe('login', () => {
    it('devuelve todos los grupos de la cuenta, no solo el activo', async () => {
      const { service } = buildHarness();

      const session = await service.login({
        username: 'pamela.calo',
        password: 'x',
      });

      expect(session.role).toBe('MaintOffice');
      expect(session.availableRoles).toEqual([
        'MaintOffice',
        'SupervisorLimpieza',
        'Propietarios',
      ]);
    });

    it('devuelve la Description de cada grupo, no solo su Code', async () => {
      const { service } = buildHarness();

      const session = await service.login({
        username: 'pamela.calo',
        password: 'x',
      });

      // El Code `MaintOffice` es interno; en pantalla se lee "TPM Equipment".
      expect(session.roleLabels.MaintOffice).toBe('TPM Equipment');
    });

    it('no tumba el login si openMAINT no da las etiquetas', async () => {
      const { service, roles } = buildHarness();
      roles.getLabels.mockResolvedValueOnce({});

      const session = await service.login({
        username: 'pamela.calo',
        password: 'x',
      });

      expect(session.roleLabels).toEqual({});
      expect(session.sessionId).toBe(SESSION_ID);
    });

    it('traduce el 401 de openMAINT a 401, no a un 500 opaco', async () => {
      const { service, auth } = buildHarness();
      auth.login.mockRejectedValueOnce(axiosError(401));

      await expect(
        service.login({ username: 'pamela.calo', password: 'mala' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('distingue openMAINT caído de credenciales malas', async () => {
      const { service, auth } = buildHarness();
      auth.login.mockRejectedValueOnce(axiosError(502));

      await expect(
        service.login({ username: 'pamela.calo', password: 'x' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('rechaza una respuesta 200 sin sessionId', async () => {
      const { service, auth } = buildHarness();
      auth.login.mockResolvedValueOnce({ data: undefined });

      await expect(
        service.login({ username: 'pamela.calo', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('propaga el rol pedido para entrar ya con el grupo elegido', async () => {
      const { service, auth } = buildHarness();

      await service.login({
        username: 'pamela.calo',
        password: 'x',
        role: 'SupervisorLimpieza',
      });

      expect(auth.login).toHaveBeenCalledWith(
        'pamela.calo',
        'x',
        'SupervisorLimpieza',
      );
    });

    it('busca la ficha Tenant solo si la cuenta es de residente', async () => {
      const { service, openmaint, serviceSession } = buildHarness(singleRole());

      const session = await service.login({
        username: 'pamela.calo',
        password: 'x',
      });

      // Sin grupo Propietarios no se paga la sesión de servicio extra.
      expect(serviceSession.get).not.toHaveBeenCalled();
      expect(openmaint.findTenantByDescription).not.toHaveBeenCalled();
      expect(session.tenantId).toBeNull();
      expect(session.employeeId).toBe(777);
    });

    it('resuelve tenantId cuando el usuario sí es residente', async () => {
      const { service, openmaint } = buildHarness();

      const session = await service.login({
        username: 'pamela.calo',
        password: 'x',
      });

      expect(openmaint.findTenantByDescription).toHaveBeenCalledWith(
        'Asistente BIM-FM',
        SERVICE_SESSION_ID,
      );
      expect(session.tenantId).toBe(999);
    });

    it('no tumba el login porque falte una ficha', async () => {
      const { service, openmaint } = buildHarness();
      openmaint.resolveEmployeeId.mockResolvedValueOnce(null);
      openmaint.resolveCleaningEmployeeId.mockResolvedValueOnce(null);

      const session = await service.login({
        username: 'pamela.calo',
        password: 'x',
      });

      expect(session.employeeId).toBeNull();
      expect(session.cleaningEmployeeId).toBeNull();
      expect(session.sessionId).toBe(SESSION_ID);
    });
  });

  describe('switchRole', () => {
    it('cambia el grupo de la sesión viva sin re-autenticar', async () => {
      const { service, auth } = buildHarness();

      const session = await service.switchRole(SESSION_ID, {
        role: 'SupervisorLimpieza',
      });

      expect(auth.setSessionRole).toHaveBeenCalledWith(
        SESSION_ID,
        'SupervisorLimpieza',
      );
      // La contraseña no vuelve a entrar en juego en ningún momento.
      expect(auth.login).not.toHaveBeenCalled();
      expect(session.sessionId).toBe(SESSION_ID);
      expect(session.role).toBe('SupervisorLimpieza');
    });

    it('rechaza un grupo que el usuario no tiene', async () => {
      const { service, auth } = buildHarness();

      await expect(
        service.switchRole(SESSION_ID, { role: 'SuperUser' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auth.setSessionRole).not.toHaveBeenCalled();
    });

    it('rechaza una sesión vacía', async () => {
      const { service } = buildHarness();

      await expect(
        service.switchRole('', { role: 'MaintOffice' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza una sesión que openMAINT ya no reconoce', async () => {
      const { service, auth } = buildHarness();
      auth.getSession.mockRejectedValueOnce(axiosError(401));

      await expect(
        service.switchRole(SESSION_ID, { role: 'MaintOffice' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('conserva los grupos de una cuenta multi-rol', async () => {
      const { service, users } = buildHarness();

      await service.changePassword(SESSION_ID, {
        currentPassword: 'vieja',
        newPassword: 'nueva-larga',
      });

      const [enviada] = users.updatePassword.mock.calls[0];
      expect(enviada.userGroups).toHaveLength(3);
      expect(enviada.defaultUserGroup).toBe(261340);
    });

    it('exige que la contraseña actual sea correcta', async () => {
      const { service, auth, users } = buildHarness();
      auth.login.mockRejectedValueOnce(axiosError(401));

      await expect(
        service.changePassword(SESSION_ID, {
          currentPassword: 'mala',
          newPassword: 'nueva-larga',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(users.updatePassword).not.toHaveBeenCalled();
    });
  });
});
