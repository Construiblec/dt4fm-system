import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AccessCredential } from './entities/access-credential.entity';
import { PinCipherService } from './pin-cipher.service';
import { PinGeneratorService } from './pin-generator.service';

/** Devuelve siempre el mismo recuento, que es lo que decide si un PIN está libre. */
const repositoryReturning = (count: number): Repository<AccessCredential> => {
  const builder: Record<string, unknown> = {};
  builder.where = () => builder;
  builder.andWhere = () => builder;
  builder.getCount = () => Promise.resolve(count);

  return {
    createQueryBuilder: () => builder,
  } as unknown as Repository<AccessCredential>;
};

const cipher = {
  fingerprint: (pin: string) => `hash:${pin}`,
} as unknown as PinCipherService;

const buildService = (
  count = 0,
  values: Record<string, string> = {},
): PinGeneratorService =>
  new PinGeneratorService(repositoryReturning(count), cipher, {
    get: (name: string) => values[name],
  } as unknown as ConfigService);

describe('PinGeneratorService', () => {
  describe('isWeak', () => {
    it.each(['0000', '1111', '9999'])('rechaza repeticiones: %s', (pin) => {
      expect(buildService().isWeak(pin)).toBe(true);
    });

    it.each(['0123', '1234', '6789'])('rechaza escaleras: %s', (pin) => {
      expect(buildService().isWeak(pin)).toBe(true);
    });

    it.each(['3210', '9876'])('rechaza escaleras invertidas: %s', (pin) => {
      expect(buildService().isWeak(pin)).toBe(true);
    });

    it.each(['1984', '2026', '1999'])('rechaza años: %s', (pin) => {
      expect(buildService().isWeak(pin)).toBe(true);
    });

    it.each(['4821', '5073', '7412'])('acepta un PIN normal: %s', (pin) => {
      expect(buildService().isWeak(pin)).toBe(false);
    });

    it('no trata como año un PIN de otra longitud', () => {
      expect(buildService().isWeak('201655')).toBe(false);
    });
  });

  describe('generate', () => {
    it('devuelve un PIN de la longitud configurada, con su huella', async () => {
      const service = buildService(0, { ACCESS_PIN_LENGTH: '4' });

      const { pin, fingerprint } = await service.generate(3025058);

      expect(pin).toMatch(/^\d{4}$/);
      expect(fingerprint).toBe(`hash:${pin}`);
    });

    it('nunca devuelve un PIN débil', async () => {
      const service = buildService();

      for (let intento = 0; intento < 40; intento += 1) {
        const { pin } = await service.generate(3025058);
        expect(service.isWeak(pin)).toBe(false);
      }
    });

    it('cae a 4 dígitos si la longitud configurada es absurda', async () => {
      const service = buildService(0, { ACCESS_PIN_LENGTH: '99' });

      const { pin } = await service.generate(3025058);

      expect(pin).toHaveLength(4);
    });

    it('avisa en vez de reintentar sin fin cuando el espacio está agotado', async () => {
      // Todo PIN aparece como ocupado: el generador tiene que rendirse.
      const service = buildService(1);

      await expect(service.generate(3025058)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
