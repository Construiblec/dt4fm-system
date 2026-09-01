import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { OwnerSessionGuard } from './owner-session.guard';
import { OwnersIdentityService, OwnerIdentity } from '../owners-identity.service';

type Headers = Record<string, string | undefined>;
type Params = Record<string, string>;

const contextWith = (headers: Headers, params: Params = {}) => {
  const request = { headers, params } as Record<string, unknown>;

  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
};

const identityOf = (over: Partial<OwnerIdentity> = {}): OwnerIdentity => ({
  userId: 900,
  username: 'juan_perez',
  tenantId: 300,
  ...over,
});

describe('OwnerSessionGuard', () => {
  let identity: { resolve: jest.Mock; forget: jest.Mock };
  let guard: OwnerSessionGuard;

  beforeEach(() => {
    identity = {
      resolve: jest.fn().mockResolvedValue(identityOf()),
      forget: jest.fn(),
    };
    guard = new OwnerSessionGuard(
      identity as unknown as OwnersIdentityService,
    );
  });

  describe('lectura de la sesión', () => {
    it('acepta la sesión en la cabecera Authorization', async () => {
      const { context } = contextWith({ authorization: 'sesion-abc' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(identity.resolve).toHaveBeenCalledWith('sesion-abc');
    });

    it('acepta la sesión en x-session-token, que tiene prioridad', async () => {
      const { context } = contextWith({
        authorization: 'de-authorization',
        'x-session-token': 'de-x-session-token',
      });

      await guard.canActivate(context);

      expect(identity.resolve).toHaveBeenCalledWith('de-x-session-token');
    });

    it('descarta el prefijo Bearer', async () => {
      const { context } = contextWith({ authorization: 'Bearer sesion-abc' });

      await guard.canActivate(context);

      expect(identity.resolve).toHaveBeenCalledWith('sesion-abc');
    });

    it('deja que el servicio rechace cuando no llega ninguna cabecera', async () => {
      identity.resolve.mockRejectedValueOnce(
        new UnauthorizedException('Falta la sesión de openMAINT'),
      );
      const { context } = contextWith({});

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('rutas acotadas por tenantId', () => {
    it('deja pasar cuando el tenant de la ruta es el de la sesión', async () => {
      const { context } = contextWith(
        { authorization: 'sesion-abc' },
        { tenantId: '300' },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('rechaza el tenant de otra persona', async () => {
      const { context } = contextWith(
        { authorization: 'sesion-abc' },
        { tenantId: '301' },
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza a una cuenta sin ficha de propietario', async () => {
      identity.resolve.mockResolvedValueOnce(identityOf({ tenantId: null }));
      const { context } = contextWith(
        { authorization: 'sesion-abc' },
        { tenantId: '300' },
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rechaza un tenantId que no es un entero positivo', async () => {
      const { context } = contextWith(
        { authorization: 'sesion-abc' },
        { tenantId: 'no-es-numero' },
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('rutas acotadas por userId', () => {
    it('deja pasar cuando el usuario de la ruta es el de la sesión', async () => {
      const { context } = contextWith(
        { authorization: 'sesion-abc' },
        { userId: '900' },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('rechaza el usuario de otra persona', async () => {
      const { context } = contextWith(
        { authorization: 'sesion-abc' },
        { userId: '901' },
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('rutas sin identificador de persona', () => {
    it('exige sesión aunque no haya nada que comparar', async () => {
      // Es el caso de POST /owners/payments/:paymentId/voucher: el guard
      // eleva el listón de anónimo a autenticado, pero NO comprueba que el
      // pago sea de quien lo sube. Esa parte queda pendiente (BP-001).
      const { context } = contextWith(
        { authorization: 'sesion-abc' },
        { paymentId: '123' },
      );

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('identidad disponible para el controlador', () => {
    it('deja la identidad resuelta en la petición', async () => {
      const { context, request } = contextWith(
        { authorization: 'sesion-abc' },
        { tenantId: '300' },
      );

      await guard.canActivate(context);

      expect(request.owner).toEqual(identityOf());
    });
  });
});
