import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { of, throwError } from 'rxjs';
import { AccessIotClient, classifyCommandError } from './access-iot.client';

const conRespuesta = (status: number, data: unknown = {}) => ({
  isAxiosError: true,
  response: { status, data, headers: {} },
});

const sinRespuesta = (code: string) => ({ isAxiosError: true, code });

/** Una orden de puerta no se reintenta: la clasificación decide qué le decimos a quien tocó el botón. */
describe('classifyCommandError', () => {
  it('un código tipado es un fallo seguro, aunque venga con 5xx', () => {
    expect(
      classifyCommandError(conRespuesta(503, { code: 'gateway_unreachable' })),
    ).toEqual({ outcome: 'failed', errorCode: 'gateway_unreachable' });
  });

  it('internal_error es incierto: la orden pudo salir', () => {
    expect(
      classifyCommandError(conRespuesta(500, { code: 'internal_error' })),
    ).toEqual({ outcome: 'uncertain', errorCode: 'internal_error' });
  });

  it('un 4xx sin código no llegó a la puerta', () => {
    expect(classifyCommandError(conRespuesta(404))).toEqual({
      outcome: 'failed',
    });
    expect(classifyCommandError(conRespuesta(429))).toEqual({
      outcome: 'failed',
    });
  });

  it('el 302 de Cloudflare a su login no llegó a la puerta', () => {
    expect(classifyCommandError(conRespuesta(302, '<html>'))).toEqual({
      outcome: 'failed',
    });
  });

  it('un 5xx sin código es incierto (incluido el 524 de Cloudflare)', () => {
    expect(classifyCommandError(conRespuesta(500))).toEqual({
      outcome: 'uncertain',
    });
    expect(classifyCommandError(conRespuesta(524))).toEqual({
      outcome: 'uncertain',
    });
  });

  it('un corte a medias es incierto', () => {
    for (const code of ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET']) {
      expect(classifyCommandError(sinRespuesta(code))).toEqual({
        outcome: 'uncertain',
      });
    }
  });

  it('no poder conectar es un fallo seguro', () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      expect(classifyCommandError(sinRespuesta(code))).toEqual({
        outcome: 'failed',
      });
    }
  });

  it('la configuración ausente es un fallo seguro', () => {
    expect(
      classifyCommandError(new Error('ACCESS_IOT_URL no está configurada')),
    ).toEqual({ outcome: 'failed' });
  });
});

/** Lo que la API central hace distinto de la guía, fijado contra el cliente real. */
describe('AccessIotClient', () => {
  const config = {
    get: (key: string) =>
      ({ ACCESS_IOT_URL: 'https://iot.test/', ACCESS_IOT_TOKEN: 'id:secreto' })[
        key
      ],
  } as unknown as ConfigService;

  const cliente = (...respuestas: unknown[]) => {
    const request = jest.fn();

    for (const respuesta of respuestas) {
      request.mockReturnValueOnce(
        (respuesta as { isAxiosError?: boolean }).isAxiosError
          ? throwError(() => respuesta)
          : of({ status: 200, data: respuesta }),
      );
    }

    return {
      request,
      client: new AccessIotClient(
        { request } as unknown as HttpService,
        config,
      ),
    };
  };

  it('no sigue redirecciones y presenta el service token', async () => {
    const { request, client } = cliente([]);

    await client.listBuildings();

    const [[enviado]] = request.mock.calls as [[AxiosRequestConfig]];

    expect(enviado).toMatchObject({
      baseURL: 'https://iot.test',
      maxRedirects: 0,
      headers: {
        'CF-Access-Client-Id': 'id',
        'CF-Access-Client-Secret': 'secreto',
      },
    });
  });

  it('el 302 de Cloudflare es un token rechazado y no se reintenta', async () => {
    const { request, client } = cliente(conRespuesta(302, '<html>'));

    await expect(client.listBuildings()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('un 200 que no es JSON del contrato no se lee como lista vacía', async () => {
    const { client } = cliente('<html>login</html>');

    await expect(client.listDevices()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('una página de inventario sin users es un error, no una página corta', async () => {
    const { client } = cliente({ nextCursor: null });

    await expect(
      client.getDeviceInventory('ING-PEATONAL-1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('un PUT con 400 invalid_request vuelve como failed, sin reintentar', async () => {
    const { request, client } = cliente(
      conRespuesta(400, { code: 'invalid_request', message: 'scope' }),
    );

    await expect(
      client.putCredential('3f9a2b11-0000-4000-8000-000000000000', {
        buildingId: 3025058,
        scope: 'vehicular',
        subjectType: 'guest',
        pin: '5073',
        validFrom: '2026-09-14T12:00:00-05:00',
        validTo: '2026-09-18T15:00:00-05:00',
        displayName: 'Ana Pérez',
      }),
    ).resolves.toMatchObject({ state: 'failed', errorCode: 'invalid_request' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('GET de una credencial con 404 not_found es null', async () => {
    const { client } = cliente(conRespuesta(404, { code: 'not_found' }));

    await expect(
      client.getCredential('3f9a2b11-0000-4000-8000-000000000000'),
    ).resolves.toBeNull();
  });

  it('una apertura uncertain llega sin marca de tiempo', async () => {
    const { client } = cliente({ state: 'uncertain', at: null });

    await expect(
      client.commandDevice('ING-VEHICULAR-1', 'open', {
        requestId: '6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13',
        actor: { type: 'staff', ref: 'cav.mock' },
      }),
    ).resolves.toEqual({ outcome: 'uncertain', at: undefined });
  });
});
