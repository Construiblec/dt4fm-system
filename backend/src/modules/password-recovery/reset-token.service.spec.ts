import { ConfigService } from '@nestjs/config';
import { ResetTokenService } from './reset-token.service';

const SECRET = 'secreto-de-pruebas';
const USER_ID = 1456092;
const PASSWORD_HASH = '2u7ke5jci0t0mque3gn7w6rdnu4zxo9kopstzk5yt7594ix1kj9';

const buildService = (secret: string | undefined = SECRET) =>
  new ResetTokenService({
    get: () => secret,
  } as unknown as ConfigService);

describe('ResetTokenService', () => {
  it('valida un token recién emitido', () => {
    const service = buildService();
    const token = service.create(USER_ID, PASSWORD_HASH);

    expect(service.verify(token, PASSWORD_HASH)).toBe(true);
    expect(service.decode(token)?.userId).toBe(USER_ID);
  });

  it('invalida el token cuando la contraseña ya cambió (un solo uso)', () => {
    const service = buildService();
    const token = service.create(USER_ID, PASSWORD_HASH);

    // Tras el reset, openMAINT guarda otro hash: la firma deja de cuadrar.
    expect(service.verify(token, 'hash-nuevo-tras-el-reset')).toBe(false);
  });

  it('rechaza un token vencido', () => {
    const service = buildService();
    const token = service.create(USER_ID, PASSWORD_HASH);

    const dosHorasDespues = Date.now() + 2 * 60 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(dosHorasDespues);

    expect(service.verify(token, PASSWORD_HASH)).toBe(false);

    jest.restoreAllMocks();
  });

  it('rechaza una firma manipulada', () => {
    const service = buildService();
    const token = service.create(USER_ID, PASSWORD_HASH);
    const [payload] = token.split('.');

    expect(service.verify(`${payload}.firmaInventada`, PASSWORD_HASH)).toBe(
      false,
    );
  });

  it('rechaza un token de otro secreto', () => {
    const token = buildService('secreto-a').create(USER_ID, PASSWORD_HASH);

    expect(buildService('secreto-b').verify(token, PASSWORD_HASH)).toBe(false);
  });

  it.each(['', 'sin-punto', 'a.b.c.d', '???.???'])(
    'no revienta con basura: %s',
    (basura) => {
      const service = buildService();

      expect(service.verify(basura, PASSWORD_HASH)).toBe(false);
    },
  );

  it('queda deshabilitado si falta PASSWORD_RESET_SECRET', () => {
    const sinSecreto = new ResetTokenService({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(sinSecreto.isConfigured()).toBe(false);
    expect(buildService().isConfigured()).toBe(true);
  });
});
