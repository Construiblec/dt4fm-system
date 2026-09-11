import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HostawayWebhookGuard } from './hostaway-webhook.guard';

const SECRET = 'a'.repeat(64);

const CONFIG = {
  HOSTAWAY_WEBHOOK_USER: 'hostaway',
  HOSTAWAY_WEBHOOK_SECRET: SECRET,
};

const basic = (credentials: string) =>
  `Basic ${Buffer.from(credentials).toString('base64')}`;

const VALID = basic(`hostaway:${SECRET}`);

const contextWith = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization === undefined ? {} : { authorization },
      }),
    }),
  }) as unknown as ExecutionContext;

const guardWith = (config: Record<string, string | undefined> = CONFIG) =>
  new HostawayWebhookGuard({
    get: (name: string) => config[name],
  } as unknown as ConfigService);

describe('HostawayWebhookGuard', () => {
  it('deja pasar a Hostaway con el Basic Auth correcto', () => {
    expect(guardWith().canActivate(contextWith(VALID))).toBe(true);
  });

  it('rechaza una contraseña distinta', () => {
    expect(() =>
      guardWith().canActivate(contextWith(basic('hostaway:otra'))),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza un usuario distinto', () => {
    expect(() =>
      guardWith().canActivate(contextWith(basic(`otro:${SECRET}`))),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza otro esquema de autorización', () => {
    expect(() =>
      guardWith().canActivate(contextWith(`Bearer ${SECRET}`)),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza credenciales sin separador', () => {
    expect(() =>
      guardWith().canActivate(contextWith(basic('sin-separador'))),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza la petición sin cabecera', () => {
    expect(() => guardWith().canActivate(contextWith())).toThrow(
      UnauthorizedException,
    );
  });

  it('tolera un salto de línea al final de las variables de entorno', () => {
    const guard = guardWith({
      HOSTAWAY_WEBHOOK_USER: 'hostaway\n',
      HOSTAWAY_WEBHOOK_SECRET: `${SECRET}\n`,
    });

    expect(guard.canActivate(contextWith(VALID))).toBe(true);
  });

  it.each(['HOSTAWAY_WEBHOOK_USER', 'HOSTAWAY_WEBHOOK_SECRET'])(
    'se apaga en vez de quedar abierto si falta %s',
    (missing) => {
      expect(() =>
        guardWith({ ...CONFIG, [missing]: '' }).canActivate(contextWith(VALID)),
      ).toThrow(ServiceUnavailableException);
    },
  );
});
