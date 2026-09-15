import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { createHmac } from 'crypto';
import { of, throwError } from 'rxjs';
import { GuestLinkPayload } from './guest-link-channel.interface';
import { SIGNATURE_HEADER, WebhookLinkChannel } from './webhook-link.channel';

const URL = 'https://webhook.site/prueba';

const payload: GuestLinkPayload = {
  event: 'guest-link.issued',
  issuedAt: '2026-09-14T13:40:00.000Z',
  stay: {
    id: 'c47ca6f1-f675-4653-a3a6-31487feb054b',
    reservationId: '90000002',
    guestName: 'Bruno Salas',
    guestEmail: 'bruno@example.com',
    channelName: 'airbnbOfficial',
    arrivalDate: '2026-09-13',
    departureDate: '2026-09-17',
    accessValidFrom: '2026-09-13T17:00:00.000Z',
    accessValidTo: '2026-09-17T19:00:00.000Z',
    buildingId: 3019998,
    openmaintUnitId: 4242,
  },
  link: { url: 'https://dt4fm.example.com/guest/dashboard?token=abc.def' },
};

const configWith = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const httpWith = (post: jest.Mock) => ({ post }) as unknown as HttpService;

describe('WebhookLinkChannel', () => {
  it('hace POST del payload en JSON', async () => {
    const post = jest.fn().mockReturnValue(of({ status: 200 }));
    const channel = new WebhookLinkChannel(
      httpWith(post),
      configWith({ GUEST_LINK_WEBHOOK_URL: URL }),
    );

    const resultado = await channel.send(payload);

    expect(resultado).toEqual({ success: true, target: URL, httpStatus: 200 });

    const [url, body, options] = post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string>; timeout: number },
    ];
    expect(url).toBe(URL);
    expect(JSON.parse(body)).toEqual(payload);
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers[SIGNATURE_HEADER]).toBeUndefined();
  });

  it('firma el cuerpo con HMAC-SHA256 cuando hay secreto', async () => {
    const post = jest.fn().mockReturnValue(of({ status: 200 }));
    const channel = new WebhookLinkChannel(
      httpWith(post),
      configWith({
        GUEST_LINK_WEBHOOK_URL: URL,
        GUEST_LINK_WEBHOOK_SECRET: 'secreto-compartido',
      }),
    );

    await channel.send(payload);

    const [, body, options] = post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    const esperada =
      'sha256=' +
      createHmac('sha256', 'secreto-compartido').update(body).digest('hex');

    // El receptor puede recalcularla sobre el cuerpo crudo y saber que somos
    // nosotros; sin secreto configurado no se manda nada que engañe.
    expect(options.headers[SIGNATURE_HEADER]).toBe(esperada);
  });

  it('falla sin lanzar cuando falta la URL', async () => {
    const post = jest.fn();
    const channel = new WebhookLinkChannel(httpWith(post), configWith({}));

    const resultado = await channel.send(payload);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toContain('GUEST_LINK_WEBHOOK_URL');
    expect(post).not.toHaveBeenCalled();
  });

  it('un 500 del receptor devuelve failed con el código, sin lanzar', async () => {
    const error = new AxiosError('Request failed', 'ERR_BAD_RESPONSE');
    (error as AxiosError).response = { status: 500 } as AxiosError['response'];
    const post = jest.fn().mockReturnValue(throwError(() => error));
    const channel = new WebhookLinkChannel(
      httpWith(post),
      configWith({ GUEST_LINK_WEBHOOK_URL: URL }),
    );

    const resultado = await channel.send(payload);

    expect(resultado.success).toBe(false);
    expect(resultado.httpStatus).toBe(500);
    expect(resultado.error).toContain('status=500');
  });

  it('un timeout devuelve failed con el código de red', async () => {
    const error = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
    const post = jest.fn().mockReturnValue(throwError(() => error));
    const channel = new WebhookLinkChannel(
      httpWith(post),
      configWith({ GUEST_LINK_WEBHOOK_URL: URL }),
    );

    const resultado = await channel.send(payload);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toContain('ECONNABORTED');
  });
});
