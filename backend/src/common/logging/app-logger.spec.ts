import { Logger } from '@nestjs/common';
import {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';
import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger, resolveLogLevels, trimStack } from './app-logger';
import { requestContext } from './request-context';

const SESSION = 'SESION-FICTICIA';
const PASSWORD = 'CONTRASENA-FICTICIA';

/** El caso real: el login de la cuenta de servicio contra openMAINT, fallido. */
function loginError(): AxiosError {
  const config = {
    method: 'post',
    url: 'http://187.77.250.224:8090/cmdbuild/services/rest/v3/sessions?scope=service',
    headers: new AxiosHeaders({ 'Cmdbuild-authorization': SESSION }),
    data: JSON.stringify({ username: 'cuenta-servicio', password: PASSWORD }),
  } as InternalAxiosRequestConfig;

  return new AxiosError(
    'Request failed with status code 500',
    'ERR_BAD_RESPONSE',
    config,
    {},
    {
      status: 500,
      statusText: 'Internal Server Error',
      data: {
        success: false,
        messages: [{ level: 'ERROR', message: 'database unavailable' }],
      },
      headers: {},
      config,
    },
  );
}

let output: string[];

/** Líneas escritas en stdout y stderr, sin las vacías. */
const lines = () => output.join('').split('\n').filter(Boolean);

function loggerWith(env: { LOG_LEVEL?: string; LOG_FORMAT?: string } = {}) {
  process.env.LOG_LEVEL = env.LOG_LEVEL ?? '';
  process.env.LOG_FORMAT = env.LOG_FORMAT ?? '';
  const logger = new AppLogger();
  Logger.overrideLogger(logger);
  return logger;
}

/** Ejecuta `run` dentro de una petición, como lo haría el middleware. */
function insideRequest(rid: string, run: () => void): void {
  const req = {
    method: 'GET',
    path: '/x',
    header: (name: string) => (name === 'x-request-id' ? rid : undefined),
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    setHeader: jest.fn(),
  }) as unknown as Response;

  requestContext(req, res, run as NextFunction);
}

describe('AppLogger', () => {
  const originalEnv = { ...process.env };
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    output = [];
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    jest.spyOn(process.stdout, 'write').mockImplementation(capture as never);
    jest.spyOn(process.stderr, 'write').mockImplementation(capture as never);
    // Como en Render: sin terminal.
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it('un AxiosError con sesión y contraseña sale en UNA línea y sin secretos (antes: 567)', () => {
    loggerWith();

    new Logger('MailerService').error(
      'No se pudo iniciar sesión',
      loginError(),
    );

    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain(
      '[MailerService] No se pudo iniciar sesión — POST /sessions?… → 500: database unavailable',
    );
    expect(output.join('')).not.toContain(SESSION);
    expect(output.join('')).not.toContain(PASSWORD);
  });

  it('el error que registra el manejador de Nest también sale en una línea', () => {
    loggerWith();

    // Así lo hace `BaseExceptionFilter`: `logger.error(exception)`.
    new Logger('ExceptionsHandler').error(loginError());

    expect(lines()).toHaveLength(1);
    expect(output.join('')).not.toContain(PASSWORD);
  });

  it('sin terminal no escribe colores ANSI', () => {
    loggerWith();

    new Logger('Prueba').warn('aviso');

    expect(output.join('')).not.toContain('\u001b[');
  });

  it('oculta el anuncio de rutas y módulos de Nest salvo en debug', () => {
    loggerWith();
    new Logger('RouterExplorer').log('Mapped {/health, GET} route');
    new Logger('InstanceLoader').log('AppModule dependencies initialized');
    expect(lines()).toHaveLength(0);

    loggerWith({ LOG_LEVEL: 'debug' });
    new Logger('RouterExplorer').log('Mapped {/health, GET} route');
    expect(lines()).toHaveLength(1);
  });

  it('respeta LOG_LEVEL', () => {
    loggerWith({ LOG_LEVEL: 'warn' });

    new Logger('Prueba').log('informativo');
    new Logger('Prueba').debug('detalle');
    new Logger('Prueba').warn('aviso');

    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain('aviso');
  });

  it('añade el rid de la petición en curso', () => {
    loggerWith();

    insideRequest('abc123', () => new Logger('Prueba').log('dentro'));
    new Logger('Prueba').log('fuera');

    expect(lines()[0]).toMatch(/dentro rid=abc123$/);
    expect(lines()[1]).toMatch(/fuera$/);
  });

  it('un objeto sale en una línea y con las claves sensibles tapadas', () => {
    loggerWith();

    new Logger('Prueba').log({
      usuario: 'ana',
      password: PASSWORD,
      nested: { token: 'T' },
    });

    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toContain("usuario: 'ana'");
    expect(lines()[0]).not.toContain(PASSWORD);
  });

  it('junta en una línea un mensaje con saltos', () => {
    loggerWith();

    new Logger('Prueba').warn('Errores encontrados:\nuno\ndos');

    expect(lines()).toEqual([
      expect.stringContaining('Errores encontrados: | uno | dos'),
    ]);
  });

  it('con LOG_FORMAT=json escribe un JSON por línea con el rid', () => {
    loggerWith({ LOG_FORMAT: 'json' });

    insideRequest('abc123', () =>
      new Logger('Prueba').error('falló', loginError()),
    );

    expect(lines()).toHaveLength(1);
    const parsed = JSON.parse(lines()[0]) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      level: 'error',
      context: 'Prueba',
      rid: 'abc123',
    });
    expect(lines()[0]).not.toContain(PASSWORD);
  });

  it('de la traza solo escribe los marcos propios, sin repetir el error', () => {
    loggerWith();

    const error = new Error('fallo inesperado');
    error.stack = [
      'Error: fallo inesperado',
      '    at Foo.bar (/app/dist/modules/foo.service.js:10:5)',
      '    at Axios.request (/app/node_modules/axios/lib/core/Axios.js:40:41)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
    ].join('\n');

    new Logger('ExceptionsHandler').error('fallo inesperado', error.stack);

    expect(lines()).toHaveLength(2);
    expect(lines()[1]).toContain('foo.service.js');
  });
});

describe('resolveLogLevels', () => {
  it('por defecto deja hasta log', () => {
    expect(resolveLogLevels(undefined)).toEqual([
      'fatal',
      'error',
      'warn',
      'log',
    ]);
  });

  it('un valor desconocido vuelve al defecto', () => {
    expect(resolveLogLevels('todo')).toEqual(['fatal', 'error', 'warn', 'log']);
  });

  it('debug incluye debug y no verbose', () => {
    expect(resolveLogLevels(' DEBUG ')).toEqual([
      'fatal',
      'error',
      'warn',
      'log',
      'debug',
    ]);
  });
});

describe('trimStack', () => {
  it('sin marcos propios queda solo la primera línea', () => {
    const stack =
      'AxiosError: boom\n    at Axios.request (/app/node_modules/axios/x.js:1:1)';

    expect(trimStack(stack)).toBe('AxiosError: boom');
  });
});
