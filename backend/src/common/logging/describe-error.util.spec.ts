import { BadGatewayException } from '@nestjs/common';
import {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  describeError,
  isSensitiveKey,
  redact,
  safePath,
} from './describe-error.util';

const SESSION = 'SESION-FICTICIA';
const PASSWORD = 'CONTRASENA-FICTICIA';
const BASE = 'http://187.77.250.224:8090/cmdbuild/services/rest/v3';

/** Un `AxiosError` como los que tira `OpenmaintClient`, con secretos dentro. */
function axiosError(
  options: {
    method?: string;
    url?: string;
    status?: number;
    data?: unknown;
    code?: string;
    message?: string;
    headers?: Record<string, string>;
  } = {},
): AxiosError {
  const config = {
    method: options.method ?? 'post',
    url: options.url ?? `${BASE}/sessions?scope=service&returnId=true`,
    headers: new AxiosHeaders({ 'Cmdbuild-authorization': SESSION }),
    data: JSON.stringify({ username: 'cuenta-servicio', password: PASSWORD }),
  } as InternalAxiosRequestConfig;

  const response =
    options.status === undefined
      ? undefined
      : {
          status: options.status,
          statusText: '',
          data: options.data,
          headers: options.headers ?? {},
          config,
        };

  return new AxiosError(
    options.message ?? 'Request failed',
    options.code,
    config,
    {},
    response,
  );
}

describe('describeError', () => {
  it('un AxiosError con sesión y contraseña sale en una línea y sin secretos', () => {
    const text = describeError(
      axiosError({
        method: 'put',
        url: `${BASE}/sessions/${SESSION}`,
        status: 500,
        data: {
          success: false,
          messages: [{ level: 'ERROR', message: 'role not found' }],
        },
      }),
    );

    expect(text).toBe('PUT /sessions/*** → 500: role not found');
    expect(text).not.toContain(SESSION);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain('\n');
  });

  it('quita host, prefijo de la API de openMAINT y la query', () => {
    const text = describeError(
      axiosError({
        method: 'get',
        url: `${BASE}/classes/CleaningTask/cards?filter=%7B%22attribute%22%7D&limit=50`,
        status: 404,
      }),
    );

    expect(text).toBe('GET /classes/CleaningTask/cards?… → 404');
    expect(text).not.toContain('187.77.250.224');
  });

  it('elige el mensaje de nivel ERROR de openMAINT', () => {
    const text = describeError(
      axiosError({
        status: 500,
        data: {
          messages: [
            { level: 'INFO', message: 'contexto' },
            { level: 'ERROR', message: 'card not found' },
          ],
        },
      }),
    );

    expect(text).toContain(': card not found');
  });

  it('usa error_description de Hostaway', () => {
    const text = describeError(
      axiosError({
        status: 401,
        data: {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        },
      }),
    );

    expect(text).toContain('401: Client authentication failed');
  });

  it('usa code y message de la VPS de accesos, con su id de petición', () => {
    const text = describeError(
      axiosError({
        status: 409,
        data: { code: 'pin_conflict', message: 'PIN en uso' },
        headers: { 'x-request-id': 'vps-123' },
      }),
    );

    expect(text).toContain(
      '409: pin_conflict: PIN en uso (id externo vps-123)',
    );
  });

  it('resume una página HTML en vez de volcarla', () => {
    const html = `<html><head><title>502 Bad Gateway</title></head><body>${'x'.repeat(5000)}</body></html>`;
    const text = describeError(axiosError({ status: 502, data: html }));

    expect(text).toContain('502: HTML «502 Bad Gateway»');
    expect(text.length).toBeLessThan(120);
  });

  it('lee un error que llega como bytes (getBuffer pide arraybuffer)', () => {
    const body = Buffer.from(
      JSON.stringify({
        messages: [{ level: 'ERROR', message: 'file missing' }],
      }),
    );
    const text = describeError(axiosError({ status: 404, data: body }));

    expect(text).toContain('404: file missing');
  });

  it('un cuerpo desconocido se recorta y no lleva claves sensibles', () => {
    const text = describeError(
      axiosError({
        status: 400,
        data: { detalle: 'algo raro', token: 'TOKEN-FICTICIO' },
      }),
    );

    expect(text).toContain('detalle');
    expect(text).not.toContain('TOKEN-FICTICIO');
  });

  it('sin respuesta, la causa es el código y el mensaje de red', () => {
    const text = describeError(
      axiosError({
        code: 'ECONNABORTED',
        message: 'timeout of 15000ms exceeded',
      }),
    );

    expect(text).toBe(
      'POST /sessions?… → ECONNABORTED: timeout of 15000ms exceeded',
    );
  });

  it('un error de Postgres lleva su SQLSTATE', () => {
    const error = Object.assign(
      new Error('permission denied for schema public'),
      {
        name: 'QueryFailedError',
        code: '42501',
      },
    );

    expect(describeError(error)).toBe(
      'QueryFailedError: permission denied for schema public (42501)',
    );
  });

  it('una HttpException da solo su mensaje', () => {
    expect(describeError(new BadGatewayException('Hostaway no responde'))).toBe(
      'Hostaway no responde',
    );
  });

  it('incluye la causa encadenada', () => {
    const error = new Error('No se pudo sincronizar', {
      cause: new Error('openMAINT caído'),
    });

    expect(describeError(error)).toBe(
      'Error: No se pudo sincronizar ← causa: Error: openMAINT caído',
    );
  });

  it('un valor que no es error se imprime en una línea y sin secretos', () => {
    const text = describeError({ motivo: 'raro', password: PASSWORD });

    expect(text).toContain('motivo');
    expect(text).not.toContain(PASSWORD);
  });

  it('nunca pasa de 300 caracteres ni de una línea', () => {
    const text = describeError(new Error(`línea uno\n${'y'.repeat(1000)}`));

    expect(text.length).toBeLessThanOrEqual(300);
    expect(text).not.toContain('\n');
  });
});

describe('safePath', () => {
  it.each([
    [`${BASE}/sessions/${SESSION}`, '/sessions/***'],
    [`${BASE}/sessions/current`, '/sessions/current'],
    [`${BASE}/sessions/current/keepalive`, '/sessions/current/keepalive'],
    ['/classes/Unit/cards/42?attrs=Code', '/classes/Unit/cards/42?…'],
    [
      'https://api.contifico.com/sistema/api/v1/documento/',
      '/sistema/api/v1/documento/',
    ],
    [undefined, ''],
  ])('%s → %s', (input, expected) => {
    expect(safePath(input)).toBe(expected);
  });
});

describe('redact', () => {
  it('tapa claves sensibles en objetos anidados y arrays', () => {
    expect(
      redact({
        usuario: 'ana',
        password: 'x',
        nested: { sessionId: 'y', items: [{ pinCode: '1234', nombre: 'n' }] },
      }),
    ).toEqual({
      usuario: 'ana',
      password: '***',
      nested: { sessionId: '***', items: [{ pinCode: '***', nombre: 'n' }] },
    });
  });

  it('no toca palabras que solo contienen «pin»', () => {
    expect(isSensitiveKey('opinion')).toBe(false);
    expect(isSensitiveKey('mapping')).toBe(false);
    expect(isSensitiveKey('plainPin')).toBe(true);
    expect(isSensitiveKey('access_pin')).toBe(true);
    expect(isSensitiveKey('PIN')).toBe(true);
  });
});
