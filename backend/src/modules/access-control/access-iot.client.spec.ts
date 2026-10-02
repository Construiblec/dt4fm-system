import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { of, throwError } from 'rxjs';
import {
  AccessIotClient,
  classifyLiveSessionError,
  classifyTriggerError,
  classifyTriggerResponse,
  isLiveSession,
} from './access-iot.client';

const conRespuesta = (status: number, data: unknown = {}) => ({
  isAxiosError: true,
  response: { status, data, headers: {} },
});

const sinRespuesta = (code: string) => ({ isAxiosError: true, code });

const REQUEST_ID = '6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13';

/** Lista blanca: solo las respuestas de la nota de `trigger` son «no salió ningún pulso». */
describe('classifyTriggerError', () => {
  it.each([
    [400, 'invalid_request'],
    [400, 'device_not_compatible'],
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not_found'],
    [500, 'device_ambiguous'],
    [502, 'gateway_rejected'],
    [503, 'operations_disabled'],
    [503, 'device_unreachable'],
    [503, 'gateway_unreachable'],
  ])('%i %s es un no seguro', (status, code) => {
    expect(classifyTriggerError(conRespuesta(status, { code }))).toEqual({
      outcome: 'failed',
      errorCode: code,
    });
  });

  it('el 302 de Cloudflare y un 401/403 sin cuerpo son token rechazado', () => {
    for (const status of [302, 401, 403]) {
      expect(classifyTriggerError(conRespuesta(status, '<html>'))).toEqual({
        outcome: 'failed',
        errorCode: 'unauthorized',
      });
    }
  });

  it('internal_error es incierto aunque traiga código', () => {
    expect(
      classifyTriggerError(conRespuesta(500, { code: 'internal_error' })),
    ).toEqual({ outcome: 'uncertain', errorCode: 'internal_error' });
  });

  it('un 5xx sin código es incierto (incluido el 524 de Cloudflare)', () => {
    for (const status of [500, 502, 503, 524]) {
      expect(classifyTriggerError(conRespuesta(status))).toEqual({
        outcome: 'uncertain',
      });
    }
  });

  it('un código conocido con otro estado se sale de la lista: incierto', () => {
    expect(
      classifyTriggerError(conRespuesta(500, { code: 'device_unreachable' })),
    ).toEqual({ outcome: 'uncertain', errorCode: 'device_unreachable' });
  });

  it('un 4xx sin código de la lista es incierto', () => {
    expect(classifyTriggerError(conRespuesta(404))).toEqual({
      outcome: 'uncertain',
    });
    expect(classifyTriggerError(conRespuesta(429))).toEqual({
      outcome: 'uncertain',
    });
  });

  it('un timeout o un corte a medias es incierto', () => {
    for (const code of ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET']) {
      expect(classifyTriggerError(sinRespuesta(code))).toEqual({
        outcome: 'uncertain',
      });
    }
  });

  it('sin conexión establecida la petición no salió: no hubo pulso', () => {
    for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) {
      expect(classifyTriggerError(sinRespuesta(code))).toEqual({
        outcome: 'failed',
      });
    }
  });

  it('la configuración ausente es un no seguro', () => {
    expect(
      classifyTriggerError(new Error('ACCESS_IOT_URL no está configurada')),
    ).toEqual({ outcome: 'failed' });
  });
});

describe('classifyTriggerResponse', () => {
  const ok = { requestId: REQUEST_ID, deviceId: 'ING-VEHICULAR-1' };

  it('triggered con el mismo requestId y deviceId es el pulso', () => {
    expect(
      classifyTriggerResponse(
        { ...ok, state: 'triggered' },
        'ING-VEHICULAR-1',
        REQUEST_ID,
      ),
    ).toEqual({ outcome: 'triggered' });
  });

  it('ambiguous es incierto', () => {
    expect(
      classifyTriggerResponse(
        { ...ok, state: 'ambiguous' },
        'ING-VEHICULAR-1',
        REQUEST_ID,
      ),
    ).toEqual({ outcome: 'uncertain' });
  });

  it('un 200 con otro requestId, otro deviceId o ilegible es incierto', () => {
    const casos = [
      { ...ok, requestId: '00000000-0000-4000-8000-000000000000' },
      { ...ok, deviceId: 'PRA-VEHICULAR-1' },
      undefined,
    ];

    for (const cuerpo of casos) {
      expect(
        classifyTriggerResponse(
          cuerpo && { ...cuerpo, state: 'triggered' },
          'ING-VEHICULAR-1',
          REQUEST_ID,
        ),
      ).toEqual({ outcome: 'uncertain' });
    }
  });
});

const SESION = {
  requestId: REQUEST_ID,
  cameraId: 'ING-CAM-01',
  buildingId: 3025058,
  whepUrl: 'https://live.construiblec.cloud/v1/live/ING-CAM-01/whep',
  ticket: 'eyJhbGciOi',
  ticketExpiresAt: '2026-10-01T20:05:32.629674+00:00',
  maxDurationSeconds: 300,
  iceServers: [{ urls: ['turns:turn.cloudflare.com:443?transport=tcp'] }],
  iceTransportPolicy: 'relay' as const,
};

describe('classifyLiveSessionError', () => {
  it.each([
    [400, 'invalid_request'],
    [404, 'not_found'],
    [500, 'device_ambiguous'],
    [503, 'gateway_unreachable'],
    [503, 'live_capacity_reached'],
    [503, 'live_unavailable'],
  ])('%i %s se conserva', (status, code) => {
    expect(classifyLiveSessionError(conRespuesta(status, { code }))).toBe(code);
  });

  it.each([302, 401, 403])('%i es el service token rechazado', (status) => {
    expect(classifyLiveSessionError(conRespuesta(status, '<html>'))).toBe(
      'unauthorized',
    );
  });

  it('un 404 sin código es una ruta ausente, no una cámara retirada', () => {
    expect(
      classifyLiveSessionError(conRespuesta(404, { detail: 'Not Found' })),
    ).toBe('live_unavailable');
  });

  it('distingue el plazo vencido de la red caída', () => {
    expect(classifyLiveSessionError(sinRespuesta('ECONNABORTED'))).toBe(
      'timeout',
    );
    expect(classifyLiveSessionError(sinRespuesta('ECONNREFUSED'))).toBe(
      'network',
    );
  });
});

describe('isLiveSession', () => {
  it('exige el eco de requestId y cameraId y con qué negociar', () => {
    expect(isLiveSession(SESION, 'ING-CAM-01', REQUEST_ID)).toBe(true);
    expect(isLiveSession(SESION, 'ING-CAM-02', REQUEST_ID)).toBe(false);
    expect(
      isLiveSession(
        { ...SESION, ticket: undefined as unknown as string },
        'ING-CAM-01',
        REQUEST_ID,
      ),
    ).toBe(false);
    expect(isLiveSession(undefined, 'ING-CAM-01', REQUEST_ID)).toBe(false);
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

  it('trigger manda solo el requestId, en minúsculas', async () => {
    const { request, client } = cliente({
      requestId: REQUEST_ID,
      deviceId: 'ING-VEHICULAR-1',
      state: 'triggered',
    });

    await expect(
      client.triggerDevice('ING-VEHICULAR-1', {
        requestId: REQUEST_ID.toUpperCase(),
      }),
    ).resolves.toEqual({ outcome: 'triggered' });

    const [[enviado]] = request.mock.calls as [[AxiosRequestConfig]];

    expect(enviado).toMatchObject({
      method: 'POST',
      url: '/v1/devices/ING-VEHICULAR-1/trigger',
      timeout: 8_000,
    });
    expect(enviado.data).toEqual({ requestId: REQUEST_ID });
  });

  it('trigger no reintenta: un timeout es un solo intento e incierto', async () => {
    const { request, client } = cliente(sinRespuesta('ECONNABORTED'));

    await expect(
      client.triggerDevice('ING-VEHICULAR-1', { requestId: REQUEST_ID }),
    ).resolves.toEqual({ outcome: 'uncertain' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('trigger con 500 internal_error queda incierto', async () => {
    const { client } = cliente(conRespuesta(500, { code: 'internal_error' }));

    await expect(
      client.triggerDevice('ING-VEHICULAR-1', { requestId: REQUEST_ID }),
    ).resolves.toMatchObject({ outcome: 'uncertain' });
  });

  it('el catálogo de cámaras filtra por edificio', async () => {
    const { request, client } = cliente([]);

    await expect(client.listCameras(3025058)).resolves.toEqual([]);

    const [[enviado]] = request.mock.calls as [[AxiosRequestConfig]];

    expect(enviado).toMatchObject({
      method: 'GET',
      url: '/v1/cameras',
      params: { buildingId: 3025058 },
    });
  });

  it('live-sessions devuelve la sesión, con requestId en minúsculas y plazo de 10 s', async () => {
    const { request, client } = cliente(SESION);

    await expect(
      client.createLiveSession('ING-CAM-01', {
        requestId: REQUEST_ID.toUpperCase(),
      }),
    ).resolves.toEqual({ outcome: 'issued', session: SESION });

    const [[enviado]] = request.mock.calls as [[AxiosRequestConfig]];

    expect(enviado).toMatchObject({
      method: 'POST',
      url: '/v1/cameras/ING-CAM-01/live-sessions',
      timeout: 10_000,
      maxRedirects: 0,
    });
    expect(enviado.data).toEqual({ requestId: REQUEST_ID });
  });

  it('live-sessions no reintenta: cada intento es otra visualización', async () => {
    const { request, client } = cliente(
      conRespuesta(503, { code: 'live_capacity_reached' }),
    );

    await expect(
      client.createLiveSession('ING-CAM-01', { requestId: REQUEST_ID }),
    ).resolves.toEqual({
      outcome: 'failed',
      errorCode: 'live_capacity_reached',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('live-sessions fuera de contrato no se entrega', async () => {
    const { client } = cliente({ ...SESION, cameraId: 'ING-CAM-02' });

    await expect(
      client.createLiveSession('ING-CAM-01', { requestId: REQUEST_ID }),
    ).resolves.toEqual({ outcome: 'failed', errorCode: 'invalid_response' });
  });
});
