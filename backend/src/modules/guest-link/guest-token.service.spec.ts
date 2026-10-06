import { ConfigService } from '@nestjs/config';
import { GuestTokenService } from './guest-token.service';

const SECRET = 'secreto-de-pruebas-suficientemente-largo';
const STAY = 'c47ca6f1-f675-4653-a3a6-31487feb054b';

const serviceWith = (secret: string | undefined) =>
  new GuestTokenService({
    get: () => secret,
  } as unknown as ConfigService);

/** Reescribe el contenido conservando la firma original del token dado. */
const conPayload = (token: string, wire: unknown): string => {
  const [, signature] = token.split('.');
  const payload = Buffer.from(JSON.stringify(wire), 'utf8').toString(
    'base64url',
  );

  return `${payload}.${signature}`;
};

describe('GuestTokenService', () => {
  const service = serviceWith(SECRET);

  it('acepta el token que acaba de emitir', () => {
    const payload = service.verify(service.create(STAY, 1));

    expect(payload).toMatchObject({ stayId: STAY, tokenVersion: 1 });
    expect(typeof payload?.nonce).toBe('string');
  });

  it('no graba ninguna fecha dentro del token', () => {
    const [encoded] = service.create(STAY, 1).split('.');
    const wire = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    // Es la propiedad que permite extender el check-out sin reenviar el enlace:
    // si hubiera una fecha aquí, el enlace ya entregado moriría en la vieja.
    expect(Object.keys(wire).sort()).toEqual(['n', 's', 'tv', 'v']);
  });

  it('emite un token distinto cada vez para la misma estancia', () => {
    expect(service.create(STAY, 1)).not.toEqual(service.create(STAY, 1));
  });

  it('rechaza un token con la firma cambiada', () => {
    const [payload] = service.create(STAY, 1).split('.');
    const otraFirma = service.create(STAY, 1).split('.')[1];

    expect(service.verify(`${payload}.${otraFirma}`)).toBeNull();
  });

  it('rechaza un token al que le cambiaron la versión para revivirlo', () => {
    const token = service.create(STAY, 1);

    expect(
      service.verify(conPayload(token, { v: 1, s: STAY, tv: 9, n: 'aaaa' })),
    ).toBeNull();
  });

  it('rechaza un token al que le cambiaron la estancia', () => {
    const token = service.create(STAY, 1);
    const ajena = '11111111-2222-4333-a444-555555555555';

    expect(
      service.verify(conPayload(token, { v: 1, s: ajena, tv: 1, n: 'aaaa' })),
    ).toBeNull();
  });

  it('rechaza un token firmado con otro secreto', () => {
    const ajeno = serviceWith('otro-secreto-distinto-igual-de-largo').create(
      STAY,
      1,
    );

    expect(service.verify(ajeno)).toBeNull();
  });

  it('rechaza una estancia que no es un uuid', () => {
    const token = service.create(STAY, 1);

    expect(
      service.verify(
        conPayload(token, { v: 1, s: '../../etc', tv: 1, n: 'aaaa' }),
      ),
    ).toBeNull();
  });

  it('rechaza basura sin romperse', () => {
    for (const basura of ['', '.', 'sinpunto', 'a.b', '....', 'null.null']) {
      expect(service.verify(basura)).toBeNull();
    }
  });

  it('se apaga en vez de aceptar cualquier cosa si falta el secreto', () => {
    const apagado = serviceWith('');

    expect(apagado.isConfigured()).toBe(false);
    expect(apagado.verify(service.create(STAY, 1))).toBeNull();
  });

  it('decode lee el contenido sin comprobar la firma', () => {
    const [payload] = service.create(STAY, 3).split('.');

    expect(service.decode(`${payload}.firma-inventada`)).toMatchObject({
      stayId: STAY,
      tokenVersion: 3,
    });
  });
});
