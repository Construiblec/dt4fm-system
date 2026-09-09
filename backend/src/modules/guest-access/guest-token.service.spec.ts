import { ConfigService } from '@nestjs/config';
import { GuestTokenService } from './guest-token.service';

const SECRET = 'secreto-de-pruebas-suficientemente-largo';

const serviceWith = (secret: string | undefined) =>
  new GuestTokenService({
    get: () => secret,
  } as unknown as ConfigService);

const HOUR = 60 * 60 * 1000;

describe('GuestTokenService', () => {
  const service = serviceWith(SECRET);
  const now = Date.parse('2026-10-11T12:00:00Z');
  const notBefore = now - 24 * HOUR;
  const expiresAt = now + 24 * HOUR;

  it('acepta el token que acaba de emitir', () => {
    const token = service.create(46157859, notBefore, expiresAt);

    const payload = service.verify(token, now);

    expect(payload).toMatchObject({
      reservationId: 46157859,
      notBefore,
      expiresAt,
    });
    expect(typeof payload?.nonce).toBe('string');
  });

  it('emite un token distinto cada vez para la misma reserva y ventana', () => {
    const primero = service.create(46157859, notBefore, expiresAt);
    const segundo = service.create(46157859, notBefore, expiresAt);

    expect(primero).not.toEqual(segundo);
  });

  it('rechaza un token con la firma cambiada', () => {
    const [payload] = service.create(46157859, notBefore, expiresAt).split('.');
    const otro = service.create(46157859, notBefore, expiresAt).split('.')[1];

    expect(service.verify(`${payload}.${otro}`, now)).toBeNull();
  });

  it('rechaza un token al que le corrieron el vencimiento', () => {
    const token = service.create(46157859, notBefore, expiresAt);
    const [, signature] = token.split('.');

    // Se reescribe el contenido conservando la firma original: es exactamente
    // lo que intentaría alguien que quiere estirar su enlace.
    const manipulado = Buffer.from(
      JSON.stringify({
        v: 1,
        r: 46157859,
        nb: notBefore,
        ex: expiresAt + 365 * 24 * HOUR,
        n: 'xxxxxxxxxxxx',
      }),
      'utf8',
    ).toString('base64url');

    expect(service.verify(`${manipulado}.${signature}`, now)).toBeNull();
  });

  it('rechaza un token de otra reserva firmado con el mismo formato', () => {
    const token = service.create(46157859, notBefore, expiresAt);
    const [, signature] = token.split('.');

    const otraReserva = Buffer.from(
      JSON.stringify({ v: 1, r: 999, nb: notBefore, ex: expiresAt, n: 'aaaa' }),
      'utf8',
    ).toString('base64url');

    expect(service.verify(`${otraReserva}.${signature}`, now)).toBeNull();
  });

  it('rechaza el token antes de que empiece su ventana', () => {
    const token = service.create(46157859, notBefore, expiresAt);

    expect(service.verify(token, notBefore - 1)).toBeNull();
  });

  it('rechaza el token una vez vencido', () => {
    const token = service.create(46157859, notBefore, expiresAt);

    expect(service.verify(token, expiresAt + 1)).toBeNull();
  });

  it('rechaza un token firmado con otro secreto', () => {
    const ajeno = serviceWith('otro-secreto-distinto-igual-de-largo').create(
      46157859,
      notBefore,
      expiresAt,
    );

    expect(service.verify(ajeno, now)).toBeNull();
  });

  it('rechaza basura sin romperse', () => {
    for (const basura of ['', '.', 'sinpunto', 'a.b', '....', 'null.null']) {
      expect(service.verify(basura, now)).toBeNull();
    }
  });

  it('se apaga en vez de aceptar cualquier cosa si falta el secreto', () => {
    const apagado = serviceWith('');
    const token = service.create(46157859, notBefore, expiresAt);

    expect(apagado.isConfigured()).toBe(false);
    expect(apagado.verify(token, now)).toBeNull();
  });

  it('decode lee el contenido sin comprobar la firma', () => {
    const [payload] = service.create(46157859, notBefore, expiresAt).split('.');

    expect(service.decode(`${payload}.firma-inventada`)).toMatchObject({
      reservationId: 46157859,
      notBefore,
      expiresAt,
    });
  });
});
