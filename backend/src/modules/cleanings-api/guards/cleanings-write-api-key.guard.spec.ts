import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from '../../password-recovery/rate-limiter.service';
import { CleaningsApiKeyGuard } from './cleanings-api-key.guard';
import { CleaningsWriteApiKeyGuard } from './cleanings-write-api-key.guard';

const READ = 'r'.repeat(32);
const READ_2 = 's'.repeat(32);
const WRITE = 'w'.repeat(32);
const WRITE_2 = 'x'.repeat(32);

type Result = { status: number; message: string; client?: string };

describe('Claves de lectura y escritura', () => {
  let headers: Record<string, string>;
  let read: CleaningsApiKeyGuard;
  let write: CleaningsWriteApiKeyGuard;

  const configure = (readKeys?: string, writeKeys?: string) => {
    const env: Record<string, string | undefined> = {
      INTEGRATIONS_READ_API_KEYS: readKeys,
      INTEGRATIONS_WRITE_API_KEYS: writeKeys,
    };
    const config = {
      get: (name: string) => env[name],
    } as unknown as ConfigService;
    const limiter = new RateLimiterService();

    read = new CleaningsApiKeyGuard(config, limiter);
    write = new CleaningsWriteApiKeyGuard(config, limiter);
  };

  const call = (guard: CleaningsApiKeyGuard, key?: string): Result => {
    const request = {
      headers: key === undefined ? {} : { 'x-api-key': key },
      ip: '10.0.0.1',
      integrationsClient: undefined as string | undefined,
    };
    headers = {};
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({
          setHeader: (name: string, value: string) => {
            headers[name] = value;
          },
        }),
      }),
    } as unknown as ExecutionContext;

    try {
      guard.canActivate(context);
      return { status: 200, message: '', client: request.integrationsClient };
    } catch (error) {
      const exception = error as HttpException;
      return {
        status: exception.getStatus(),
        message: exception.message,
        client: request.integrationsClient,
      };
    }
  };

  const status = (guard: CleaningsApiKeyGuard, key?: string) =>
    call(guard, key).status;

  afterEach(() => jest.useRealTimers());

  it('la clave de escritura escribe y lee, y deja el nombre del cliente', () => {
    configure(`lector:${READ}`, `editor:${WRITE}, otro : ${WRITE_2}`);

    expect(call(write, WRITE).client).toBe('editor');
    expect(call(write, WRITE_2).client).toBe('otro');
    expect(call(read, WRITE).client).toBe('editor');
    expect(call(read, READ).client).toBe('lector');
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('403 con una clave de lectura en una ruta de escritura', () => {
    configure(`lector:${READ}`, `editor:${WRITE}`);

    expect(call(write, READ)).toEqual({
      status: 403,
      message: 'La clave no tiene permiso de escritura',
      client: undefined,
    });
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it.each([undefined, '  ', 'mala', WRITE.slice(1), `editor:${WRITE}`])(
    '401 en ambas con la clave %s',
    (key) => {
      configure(`lector:${READ}`, `editor:${WRITE}`);

      expect(status(read, key)).toBe(401);
      expect(status(write, key)).toBe(401);
    },
  );

  it.each([
    ['ausente', undefined],
    ['vacía', '  '],
    ['sin separador', WRITE],
    ['nombre vacío', `:${WRITE}`],
    ['clave corta', 'editor:corta'],
    ['una inválida entre válidas', `editor:${WRITE},otro:corta`],
    ['coma sobrante', `editor:${WRITE},`],
    ['una clave también de lectura', `editor:${WRITE},otro:${READ_2}`],
  ])('escritura %s: 503 al escribir y lectura intacta', (_case, writeKeys) => {
    configure(`lector:${READ},otro:${READ_2}`, writeKeys);

    for (const key of [undefined, READ, READ_2, WRITE]) {
      const result = call(write, key);
      expect(result.status).toBe(503);
      expect(result.message).not.toMatch(/openmaint/i);
    }
    expect(headers['Cache-Control']).toBe('private, no-store');
    expect(status(read, READ)).toBe(200);
    expect(status(read, READ_2)).toBe(200);
    expect(status(read, WRITE)).toBe(401);
  });

  it.each([
    ['ausente', undefined],
    ['inválida', `lector:${READ},otro:corta`],
  ])('lectura %s y escritura válida: solo vale esta', (_case, readKeys) => {
    configure(readKeys, `editor:${WRITE}`);

    expect(status(read, WRITE)).toBe(200);
    expect(status(write, WRITE)).toBe(200);
    expect(status(read, READ)).toBe(401);
    expect(status(write, READ)).toBe(401);
  });

  it('una clave repetida se detecta aunque la lista de lectura sea inválida', () => {
    configure(`lector:${WRITE},otro:corta`, `editor:${WRITE}`);

    expect(status(write, WRITE)).toBe(503);
    expect(status(read, WRITE)).toBe(503);
  });

  it('sin ninguna lista, 503 en ambas', () => {
    configure();

    expect(status(read, READ)).toBe(503);
    expect(status(write, WRITE)).toBe(503);
  });

  it('cupos separados: 20 escrituras, 60 lecturas y ninguno se mezcla', () => {
    jest.useFakeTimers();
    configure(`mismo:${READ}`, `mismo:${WRITE},mismo:${WRITE_2}`);

    for (let i = 0; i < 20; i += 1) {
      expect(status(write, i % 2 ? WRITE : WRITE_2)).toBe(200);
    }
    expect(status(write, WRITE)).toBe(429);
    expect(headers['Retry-After']).toBe('60');

    for (let i = 0; i < 60; i += 1) expect(status(read, WRITE)).toBe(200);
    expect(status(read, WRITE)).toBe(429);

    for (let i = 0; i < 60; i += 1) expect(status(read, READ)).toBe(200);
    expect(status(read, READ)).toBe(429);

    jest.advanceTimersByTime(60_000);
    expect(status(write, WRITE)).toBe(200);
  });

  it('los 403 gastan el cupo de lectura de ese cliente, no el de escritura', () => {
    configure(`mismo:${READ}`, `mismo:${WRITE}`);

    for (let i = 0; i < 60; i += 1) expect(status(write, READ)).toBe(403);

    expect(status(write, READ)).toBe(429);
    expect(status(read, READ)).toBe(429);
    expect(status(write, WRITE)).toBe(200);
  });
});
