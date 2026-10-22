import {
  ArgumentsHost,
  BadGatewayException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, type AbstractHttpAdapter } from '@nestjs/core';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import { requestContext } from '../logging/request-context';
import { AllExceptionsFilter } from './all-exceptions.filter';

function adapter() {
  return {
    reply: jest.fn(),
    isHeadersSent: jest.fn(() => false),
    end: jest.fn(),
  };
}

function hostFor(response: object): ArgumentsHost {
  return {
    getType: () => 'http',
    getArgByIndex: (index: number) => (index === 1 ? response : {}),
  } as unknown as ArgumentsHost;
}

/** Ejecuta el filtro dentro de una petición y devuelve la línea final. */
function insideRequest(run: () => void): string | undefined {
  const req = {
    method: 'GET',
    path: '/x',
    baseUrl: '',
    route: { path: '/x' },
    header: () => undefined,
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    statusCode: 500,
    setHeader: jest.fn(),
  });
  const error = jest.spyOn(Logger.prototype, 'error');
  const warn = jest.spyOn(Logger.prototype, 'warn');

  requestContext(req, res as unknown as Response, run);
  res.emit('finish');

  const calls = [...error.mock.calls, ...warn.mock.calls];
  return calls.at(-1)?.[0] as string | undefined;
}

describe('AllExceptionsFilter', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('responde a un error desconocido exactamente lo mismo que Nest', () => {
    const ours = adapter();
    const nest = adapter();
    const response = {};
    const failure = new Error('boom');

    new AllExceptionsFilter(ours as unknown as AbstractHttpAdapter).catch(
      failure,
      hostFor(response),
    );
    new BaseExceptionFilter(nest as unknown as AbstractHttpAdapter).catch(
      failure,
      hostFor(response),
    );

    expect(ours.reply).toHaveBeenCalledWith(
      response,
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
    expect(ours.reply.mock.calls).toEqual(nest.reply.mock.calls);
  });

  it('conserva el estado de un error con statusCode (body-parser, 413)', () => {
    const ours = adapter();
    const tooLarge = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
    });

    new AllExceptionsFilter(ours as unknown as AbstractHttpAdapter).catch(
      tooLarge,
      hostFor({}),
    );

    expect(ours.reply).toHaveBeenCalledWith(
      {},
      { statusCode: 413, message: 'request entity too large' },
      413,
    );
  });

  it('registra un error desconocido en una sola llamada, sin volcar el objeto', () => {
    const failure = new Error('boom');

    new AllExceptionsFilter(adapter() as unknown as AbstractHttpAdapter).catch(
      failure,
      hostFor({}),
    );

    const [message, stack] = (logError.mock.calls as unknown[][])[0];

    expect(logError).toHaveBeenCalledTimes(1);
    expect(message).toBe('Error: boom');
    expect(typeof stack).toBe('string');
  });

  it('no registra una HttpException: su motivo va a la línea de la petición', () => {
    const filter = new AllExceptionsFilter(
      adapter() as unknown as AbstractHttpAdapter,
    );

    const line = insideRequest(() =>
      filter.catch(
        new BadGatewayException('Hostaway no responde'),
        hostFor({}),
      ),
    );

    expect(line).toMatch(/ 500 \(\d+ ms\) Hostaway no responde$/);
  });

  it('junta los mensajes de validación en el motivo', () => {
    const filter = new AllExceptionsFilter(
      adapter() as unknown as AbstractHttpAdapter,
    );

    const line = insideRequest(() =>
      filter.catch(
        new BadRequestException([
          'email must be an email',
          'name should not be empty',
        ]),
        hostFor({}),
      ),
    );

    expect(line).toContain('email must be an email; name should not be empty');
  });

  it('responde una HttpException igual que Nest', () => {
    const ours = adapter();
    const nest = adapter();
    const exception = new BadGatewayException('Hostaway no responde');

    new AllExceptionsFilter(ours as unknown as AbstractHttpAdapter).catch(
      exception,
      hostFor({}),
    );
    new BaseExceptionFilter(nest as unknown as AbstractHttpAdapter).catch(
      exception,
      hostFor({}),
    );

    expect(ours.reply.mock.calls).toEqual(nest.reply.mock.calls);
  });
});
