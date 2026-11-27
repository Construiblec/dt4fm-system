import { ExecutionContext, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationsApiKeyGuard } from '../../integrations-api/guards/integrations-api-key.guard';
import { MaintenanceApiKeyGuard } from '../../integrations-api/guards/maintenance-api-key.guard';
import { MaintenanceWriteApiKeyGuard } from '../../integrations-api/guards/maintenance-write-api-key.guard';
import { resetKeyListWarnings } from '../../integrations-api/utils/read-key-list.util';
import { RateLimiterService } from '../../password-recovery/rate-limiter.service';
import { CleaningsApiKeyGuard } from './cleanings-api-key.guard';
import { CleaningsWriteApiKeyGuard } from './cleanings-write-api-key.guard';

const KEY_A = 'a'.repeat(32);
const KEY_B = 'b'.repeat(40);
const KEY_C = 'c'.repeat(32);

describe('CleaningsApiKeyGuard', () => {
  let headers: Record<string, string>;

  const configOf = (env: Record<string, string | undefined>) =>
    ({ get: (name: string) => env[name] }) as unknown as ConfigService;

  const guardWith = (value?: string) =>
    new CleaningsApiKeyGuard(
      configOf({ INTEGRATIONS_READ_API_KEYS: value }),
      new RateLimiterService(),
    );

  const call = (
    guard: IntegrationsApiKeyGuard,
    key?: string,
    ip = '10.0.0.1',
  ): { status: number; message: string } => {
    headers = {};
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: key === undefined ? {} : { 'x-api-key': key },
          ip,
        }),
        getResponse: () => ({
          setHeader: (name: string, value: string) => {
            headers[name] = value;
          },
        }),
      }),
    } as unknown as ExecutionContext;

    try {
      guard.canActivate(context);
      return { status: 200, message: '' };
    } catch (error) {
      const exception = error as HttpException;
      return { status: exception.getStatus(), message: exception.message };
    }
  };

  afterEach(() => jest.useRealTimers());

  describe('variables obsoletas', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      resetKeyListWarnings();
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => warn.mockRestore());

    it('usa CLEANINGS_API_KEYS si la nueva está vacía y avisa una sola vez', () => {
      const guard = new CleaningsApiKeyGuard(
        configOf({
          CLEANINGS_API_KEYS: `uno:${KEY_A}`,
          INTEGRATIONS_READ_API_KEYS: ' ',
        }),
        new RateLimiterService(),
      );

      expect(call(guard, KEY_A).status).toBe(200);
      expect(call(guard, KEY_A).status).toBe(200);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'CLEANINGS_API_KEYS está obsoleta: renombrar a INTEGRATIONS_READ_API_KEYS',
      );
    });

    it('con las dos gana la nueva y también avisa', () => {
      const guard = new CleaningsApiKeyGuard(
        configOf({
          CLEANINGS_API_KEYS: `viejo:${KEY_A}`,
          INTEGRATIONS_READ_API_KEYS: `nuevo:${KEY_B}`,
        }),
        new RateLimiterService(),
      );

      expect(call(guard, KEY_B).status).toBe(200);
      expect(call(guard, KEY_A).status).toBe(401);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('la variable de escritura obsoleta también sirve y avisa', () => {
      const guard = new CleaningsWriteApiKeyGuard(
        configOf({
          INTEGRATIONS_READ_API_KEYS: `lector:${KEY_A}`,
          CLEANINGS_WRITE_API_KEYS: `editor:${KEY_B}`,
        }),
        new RateLimiterService(),
      );

      expect(call(guard, KEY_B).status).toBe(200);
      expect(warn).toHaveBeenCalledWith(
        'CLEANINGS_WRITE_API_KEYS está obsoleta: renombrar a INTEGRATIONS_WRITE_API_KEYS',
      );
    });

    it('sin avisos si solo están las nuevas', () => {
      expect(call(guardWith(`uno:${KEY_A}`), KEY_A).status).toBe(200);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('familia de mantenimiento', () => {
    const env = {
      INTEGRATIONS_READ_API_KEYS: `lector:${KEY_A}`,
      INTEGRATIONS_WRITE_API_KEYS: `editor:${KEY_B}`,
    };

    it('mensajes 503 propios', () => {
      const empty = configOf({});

      expect(
        call(new MaintenanceApiKeyGuard(empty, new RateLimiterService()), KEY_A)
          .message,
      ).toBe('La API de mantenimiento no está configurada');
      expect(
        call(
          new MaintenanceWriteApiKeyGuard(empty, new RateLimiterService()),
          KEY_A,
        ).message,
      ).toBe('La escritura de mantenimiento no está configurada');
      expect(
        call(new CleaningsApiKeyGuard(empty, new RateLimiterService()), KEY_A)
          .message,
      ).toBe('La API de limpiezas no está configurada');
      expect(
        call(
          new CleaningsWriteApiKeyGuard(empty, new RateLimiterService()),
          KEY_A,
        ).message,
      ).toBe('La escritura de limpiezas no está configurada');
    });

    it('cupos por familia, pero el contador de IP es común', () => {
      const limiter = new RateLimiterService();
      const cleanings = new CleaningsApiKeyGuard(configOf(env), limiter);
      const maintenance = new MaintenanceApiKeyGuard(configOf(env), limiter);

      for (let i = 0; i < 60; i += 1) call(cleanings, KEY_A);
      expect(call(cleanings, KEY_A).status).toBe(429);
      expect(call(maintenance, KEY_A).status).toBe(200);

      for (let i = 0; i < 10; i += 1) {
        expect(call(cleanings, 'mala', '10.9.9.9').status).toBe(401);
        expect(call(maintenance, 'mala', '10.9.9.9').status).toBe(401);
      }
      expect(call(maintenance, 'mala', '10.9.9.9').status).toBe(429);
    });
  });

  it.each([
    ['sin variable', undefined],
    ['vacía', '   '],
    ['sin separador', KEY_A],
    ['nombre vacío', ` :${KEY_A}`],
    ['clave vacía', 'agente:'],
    ['clave corta', `agente:${'a'.repeat(31)}`],
    ['una inválida entre válidas', `uno:${KEY_A},dos:corta`],
    ['coma sobrante', `uno:${KEY_A},`],
  ])('503 con configuración inválida: %s', (_case, value) => {
    const result = call(guardWith(value), KEY_A);

    expect(result.status).toBe(503);
    expect(result.message).not.toContain(KEY_A);
  });

  it('acepta cada clave configurada, con espacios y nombre repetido', () => {
    const guard = guardWith(` uno : ${KEY_A} , uno:${KEY_B},dos:${KEY_C} `);

    for (const key of [KEY_A, KEY_B, KEY_C]) {
      expect(call(guard, key).status).toBe(200);
    }
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('separa por el primer «:»', () => {
    const key = `x:${KEY_A}`;
    const guard = guardWith(`uno:${key}`);

    expect(call(guard, key).status).toBe(200);
    expect(call(guard, KEY_A).status).toBe(401);
  });

  it.each([
    ['ausente', undefined],
    ['vacía', '  '],
    ['otra', KEY_B],
    ['prefijo', KEY_A.slice(1)],
    ['con nombre', `uno:${KEY_A}`],
  ])('401 con clave %s, sin repetirla', (_case, key) => {
    const result = call(guardWith(`uno:${KEY_A}`), key);

    expect(result).toEqual({
      status: 401,
      message: 'Clave de API ausente o inválida',
    });
  });

  it('limita a 60 por minuto y por nombre, aunque cambie de clave o de IP', () => {
    jest.useFakeTimers();
    const guard = guardWith(`uno:${KEY_A},uno:${KEY_B},dos:${KEY_C}`);

    for (let i = 0; i < 60; i += 1) {
      const key = i % 2 ? KEY_A : KEY_B;
      expect(call(guard, key, `10.0.1.${i}`).status).toBe(200);
    }

    expect(call(guard, KEY_A).status).toBe(429);
    expect(headers['Retry-After']).toBe('60');
    expect(call(guard, KEY_C).status).toBe(200);

    jest.advanceTimersByTime(60_000);
    expect(call(guard, KEY_A).status).toBe(200);
  });

  it('limita a 20 inválidas por IP sin bloquear la clave válida', () => {
    const guard = guardWith(`uno:${KEY_A}`);

    for (let i = 0; i < 20; i += 1) {
      expect(call(guard, i % 2 ? undefined : `mala-${i}`).status).toBe(401);
    }

    expect(call(guard, 'mala').status).toBe(429);
    expect(headers['Retry-After']).toBe('60');
    expect(call(guard, 'mala', '10.0.0.2').status).toBe(401);
    expect(call(guard, KEY_A).status).toBe(200);
  });
});
