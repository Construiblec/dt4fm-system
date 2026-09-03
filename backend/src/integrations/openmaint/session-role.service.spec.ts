import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { OpenmaintService } from './openmaint.service';
import { SessionRoleService } from './session-role.service';

describe('SessionRoleService', () => {
  let service: SessionRoleService;
  let openmaintService: { getSession: jest.Mock };

  beforeEach(() => {
    openmaintService = { getSession: jest.fn() };
    service = new SessionRoleService(
      openmaintService as unknown as OpenmaintService,
    );
  });

  it('lanza 401 si no se pasa sessionId', async () => {
    await expect(service.resolveRole('')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(openmaintService.getSession).not.toHaveBeenCalled();
  });

  it('devuelve el rol activo de la sesión', async () => {
    openmaintService.getSession.mockResolvedValue({
      _id: 's1',
      username: 'pamela.calo',
      userId: 453364,
      role: 'SupervisorMantenimiento',
      availableRoles: ['SupervisorMantenimiento'],
    });

    await expect(service.resolveRole('s1')).resolves.toBe(
      'SupervisorMantenimiento',
    );
  });

  it('devuelve null si la sesión no trae rol', async () => {
    openmaintService.getSession.mockResolvedValue({
      _id: 's1',
      username: 'x',
      userId: 1,
      role: null,
    });

    await expect(service.resolveRole('s1')).resolves.toBeNull();
  });

  it('lanza 401 si openMAINT no devuelve sesión', async () => {
    openmaintService.getSession.mockResolvedValue(null);

    await expect(service.resolveRole('s1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('traduce un 400 de openMAINT (sesión inexistente) a 401', async () => {
    openmaintService.getSession.mockRejectedValue({
      response: { status: 400 },
    });

    await expect(service.resolveRole('s1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('un fallo de red se traduce a 502, no a 401', async () => {
    openmaintService.getSession.mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.resolveRole('s1')).rejects.toThrow(
      BadGatewayException,
    );
  });
});
