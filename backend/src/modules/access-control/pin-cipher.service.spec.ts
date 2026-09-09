import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinCipherService } from './pin-cipher.service';

const KEY = Buffer.alloc(32, 7).toString('base64');
const FINGERPRINT_KEY = Buffer.alloc(32, 9).toString('base64');

const buildService = (
  overrides: Partial<Record<string, string>> = {},
): PinCipherService => {
  const values: Record<string, string | undefined> = {
    ACCESS_PIN_KEY: KEY,
    ACCESS_PIN_FINGERPRINT_KEY: FINGERPRINT_KEY,
    ...overrides,
  };

  return new PinCipherService({
    get: (name: string) => values[name],
  } as unknown as ConfigService);
};

describe('PinCipherService', () => {
  it('descifra lo que cifró', () => {
    const service = buildService();

    expect(service.decrypt(service.encrypt('4821'))).toBe('4821');
  });

  it('produce un texto cifrado distinto cada vez (IV aleatorio)', () => {
    const service = buildService();

    expect(service.encrypt('4821')).not.toBe(service.encrypt('4821'));
  });

  it('detecta manipulación del texto cifrado', () => {
    const service = buildService();
    const [iv, tag, ciphertext] = service.encrypt('4821').split(':');
    const alterado = Buffer.from(ciphertext, 'base64url');
    alterado[0] ^= 0xff;

    expect(() =>
      service.decrypt(`${iv}:${tag}:${alterado.toString('base64url')}`),
    ).toThrow();
  });

  it('rechaza un formato que no tenga las tres partes', () => {
    const service = buildService();

    expect(() => service.decrypt('solo-una-parte')).toThrow(
      'Formato de PIN cifrado inválido',
    );
  });

  it('da la misma huella para el mismo PIN y distinta para otro', () => {
    const service = buildService();

    expect(service.fingerprint('4821')).toBe(service.fingerprint('4821'));
    expect(service.fingerprint('4821')).not.toBe(service.fingerprint('4822'));
  });

  it('la huella no coincide con la de otra clave', () => {
    const otra = buildService({
      ACCESS_PIN_FINGERPRINT_KEY: Buffer.alloc(32, 3).toString('base64'),
    });

    expect(buildService().fingerprint('4821')).not.toBe(
      otra.fingerprint('4821'),
    );
  });

  it.each([
    ['ausente', undefined],
    ['vacía', ''],
    ['con longitud incorrecta', Buffer.alloc(16, 1).toString('base64')],
  ])('queda sin configurar si la clave está %s', (_caso, valor) => {
    const service = buildService({ ACCESS_PIN_KEY: valor });

    expect(service.isConfigured()).toBe(false);
    expect(() => service.encrypt('4821')).toThrow(ServiceUnavailableException);
  });

  it('sin configurar tampoco calcula huellas', () => {
    const service = buildService({ ACCESS_PIN_FINGERPRINT_KEY: '' });

    expect(() => service.fingerprint('4821')).toThrow(
      ServiceUnavailableException,
    );
  });
});
