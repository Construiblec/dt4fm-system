import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IOT_SECRET_HEADER, IotWebhookGuard } from './iot-webhook.guard';

const SECRET = 'a'.repeat(64);

const contextWith = (header?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: header === undefined ? {} : { [IOT_SECRET_HEADER]: header },
      }),
    }),
  }) as unknown as ExecutionContext;

const guardWith = (configured: string | undefined) =>
  new IotWebhookGuard({
    get: () => configured,
  } as unknown as ConfigService);

describe('IotWebhookGuard', () => {
  it('deja pasar a la Raspberry con el secreto correcto', () => {
    expect(guardWith(SECRET).canActivate(contextWith(SECRET))).toBe(true);
  });

  it('rechaza un secreto distinto', () => {
    expect(() =>
      guardWith(SECRET).canActivate(contextWith('b'.repeat(64))),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza un secreto de otra longitud sin romper la comparación', () => {
    expect(() => guardWith(SECRET).canActivate(contextWith('corto'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza la petición sin cabecera', () => {
    expect(() => guardWith(SECRET).canActivate(contextWith())).toThrow(
      UnauthorizedException,
    );
  });

  it('se apaga en vez de quedar abierto si falta la configuración', () => {
    expect(() => guardWith('').canActivate(contextWith(SECRET))).toThrow(
      ServiceUnavailableException,
    );
  });
});
