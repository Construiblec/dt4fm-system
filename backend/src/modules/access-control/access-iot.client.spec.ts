import { classifyCommandError } from './access-iot.client';

const conRespuesta = (status: number, data: Record<string, unknown> = {}) => ({
  isAxiosError: true,
  response: { status, data },
});

const sinRespuesta = (code: string) => ({ isAxiosError: true, code });

/** Una orden de puerta no se reintenta: la clasificación decide qué le decimos a quien tocó el botón. */
describe('classifyCommandError', () => {
  it('un código tipado es un fallo seguro, aunque venga con 5xx', () => {
    expect(
      classifyCommandError(conRespuesta(503, { code: 'gateway_unreachable' })),
    ).toEqual({ outcome: 'failed', errorCode: 'gateway_unreachable' });
  });

  it('un 4xx sin código no llegó a la puerta', () => {
    expect(classifyCommandError(conRespuesta(404))).toEqual({
      outcome: 'failed',
    });
    expect(classifyCommandError(conRespuesta(429))).toEqual({
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
