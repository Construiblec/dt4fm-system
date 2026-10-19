import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import {
  currentRequestId,
  recordFailure,
  REQUEST_ID_HEADER,
  requestContext,
} from './request-context';

type FakeResponse = EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
};

function fake(
  options: {
    method?: string;
    path?: string;
    route?: string;
    incomingRid?: string;
  } = {},
) {
  const req = {
    method: options.method ?? 'GET',
    path: options.path ?? '/cleaning-tasks/42',
    baseUrl: '',
    route:
      options.route === undefined
        ? { path: '/cleaning-tasks/:id' }
        : options.route
          ? { path: options.route }
          : undefined,
    header: (name: string) =>
      name.toLowerCase() === 'x-request-id' ? options.incomingRid : undefined,
  } as unknown as Request;

  const headers: Record<string, string> = {};
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  }) as FakeResponse;

  return { req, res: res as unknown as Response, fakeRes: res };
}

/** Primer argumento de la llamada `index` a un logger espiado. */
function messageOf(spy: jest.SpyInstance, index = 0): string {
  return String((spy.mock.calls as unknown[][])[index]?.[0]);
}

describe('requestContext', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('da un id a la petición, lo devuelve en X-Request-Id y lo deja disponible', () => {
    const { req, res, fakeRes } = fake();
    let seen: string | undefined;

    requestContext(req, res, () => {
      seen = currentRequestId();
    });

    expect(seen).toMatch(/^[0-9a-f]{8}$/);
    expect(fakeRes.headers[REQUEST_ID_HEADER]).toBe(seen);
  });

  it('respeta un x-request-id válido que llega de fuera', () => {
    const { req, res, fakeRes } = fake({ incomingRid: 'front-1234' });

    requestContext(req, res, () => undefined);

    expect(fakeRes.headers[REQUEST_ID_HEADER]).toBe('front-1234');
  });

  it('descarta un x-request-id con caracteres raros o demasiado largo', () => {
    for (const incomingRid of [
      'con espacio',
      'x'.repeat(65),
      'salto\nde-linea',
    ]) {
      const { req, res, fakeRes } = fake({ incomingRid });

      requestContext(req, res, () => undefined);

      expect(fakeRes.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('escribe una línea al terminar, con el patrón de la ruta y no la URL', () => {
    const { req, res, fakeRes } = fake();

    requestContext(req, res, () => undefined);
    fakeRes.emit('finish');

    expect(log).toHaveBeenCalledTimes(1);
    expect(messageOf(log)).toMatch(
      /^GET \/cleaning-tasks\/:id 200 \(\d+ ms\)$/,
    );
  });

  it('un 4xx va como warn y un 5xx como error, con el motivo registrado', () => {
    const notFound = fake();
    requestContext(notFound.req, notFound.res, () => undefined);
    notFound.fakeRes.statusCode = 404;
    notFound.fakeRes.emit('finish');

    const broken = fake();
    requestContext(broken.req, broken.res, () =>
      recordFailure('openMAINT no responde'),
    );
    broken.fakeRes.statusCode = 502;
    broken.fakeRes.emit('finish');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(messageOf(error)).toMatch(/ 502 \(\d+ ms\) openMAINT no responde$/);
  });

  it('sin ruta resuelta usa la URL sin query', () => {
    const { req, res, fakeRes } = fake({ route: '', path: '/no-existe' });

    requestContext(req, res, () => undefined);
    fakeRes.statusCode = 404;
    fakeRes.emit('finish');

    expect(messageOf(warn)).toMatch(/^GET \/no-existe 404/);
  });

  it('no escribe línea para /health ni para los preflight de CORS', () => {
    for (const options of [{ path: '/health' }, { method: 'OPTIONS' }]) {
      const { req, res, fakeRes } = fake(options);

      requestContext(req, res, () => undefined);
      fakeRes.emit('finish');
    }

    expect(log).not.toHaveBeenCalled();
  });

  it('recordFailure fuera de una petición no hace nada', () => {
    expect(() => recordFailure('sin petición')).not.toThrow();
  });
});
