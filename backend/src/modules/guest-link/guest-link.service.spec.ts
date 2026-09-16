import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  GuestLinkChannel,
  GuestLinkSendResult,
} from './delivery/guest-link-channel.interface';
import { GuestLinkDelivery } from './entities/guest-link-delivery.entity';
import { GuestShortLink } from './entities/guest-short-link.entity';
import { GuestLinkService, GuestLinkStayInput } from './guest-link.service';
import { GuestTokenService } from './guest-token.service';

const HOUR = 60 * 60 * 1000;
const STAY = 'c47ca6f1-f675-4653-a3a6-31487feb054b';

const configWith = (extra: Record<string, string> = {}) =>
  ({
    get: (key: string) =>
      ({
        GUEST_MAGICLINK_SECRET: 'secreto-de-pruebas-suficientemente-largo',
        APP_BASE_URL: 'https://dt4fm.example.com/',
        ...extra,
      })[key],
  }) as unknown as ConfigService;

const config = configWith();

const stayWith = (
  overrides: Partial<GuestLinkStayInput> = {},
): GuestLinkStayInput => ({
  id: STAY,
  tokenVersion: 1,
  hostawayReservationId: '90000002',
  guestName: 'Bruno Salas',
  guestEmail: 'bruno@example.com',
  channelName: 'airbnbOfficial',
  arrivalDate: '2026-09-13',
  departureDate: '2026-09-17',
  accessValidFrom: new Date(Date.now() - 24 * HOUR),
  accessValidTo: new Date(Date.now() + 48 * HOUR),
  buildingId: 3019998,
  openmaintUnitId: 4242,
  ...overrides,
});

type Harness = {
  service: GuestLinkService;
  send: jest.Mock;
  exists: jest.Mock;
  save: jest.Mock;
  shortRows: Partial<GuestShortLink>[];
};

const harness = (options: {
  alreadySent?: boolean;
  /** Último intento registrado para la estancia, si lo hay. */
  lastDelivery?: Partial<GuestLinkDelivery>;
  sendResult?: GuestLinkSendResult;
  sendThrows?: boolean;
  config?: ConfigService;
}): Harness => {
  const send = options.sendThrows
    ? jest.fn().mockRejectedValue(new Error('canal roto'))
    : jest.fn().mockResolvedValue(
        options.sendResult ?? {
          success: true,
          target: 'https://ejemplo.test/hook',
          httpStatus: 200,
        },
      );
  const exists = jest.fn().mockResolvedValue(options.alreadySent ?? false);
  const findOne = jest.fn().mockResolvedValue(options.lastDelivery ?? null);
  const save = jest
    .fn()
    .mockImplementation((row: unknown) => Promise.resolve(row));

  const shortRows: Partial<GuestShortLink>[] = [];
  const shortLinks = {
    create: (row: Partial<GuestShortLink>) => row,
    save: (row: Partial<GuestShortLink>) => {
      shortRows.push(row);
      return Promise.resolve(row);
    },
    findOne: ({ where }: { where: { codeHash: string } }) =>
      Promise.resolve(
        shortRows.find((row) => row.codeHash === where.codeHash) ?? null,
      ),
  } as unknown as Repository<GuestShortLink>;

  const channel = { name: 'webhook', send } as unknown as GuestLinkChannel;
  const deliveries = {
    exists,
    findOne,
    save,
    create: (row: unknown) => row,
  } as unknown as Repository<GuestLinkDelivery>;

  const cfg = options.config ?? config;

  return {
    send,
    exists,
    save,
    shortRows,
    service: new GuestLinkService(
      deliveries,
      shortLinks,
      new GuestTokenService(cfg),
      channel,
      cfg,
    ),
  };
};

describe('GuestLinkService', () => {
  describe('emisión', () => {
    it('arma una URL corta sin doble barra y sin el token', async () => {
      const { service } = harness({});

      const { url, token } = await service.issue({ id: STAY, tokenVersion: 1 });

      expect(url).toMatch(
        /^https:\/\/dt4fm\.example\.com\/g\/[0-9A-Za-z]{10}$/,
      );
      expect(url).not.toContain(token);
    });

    it('guarda solo el hash del código', async () => {
      const { service, shortRows } = harness({});

      const { url } = await service.issue({ id: STAY, tokenVersion: 2 });
      const code = url.split('/').pop()!;

      expect(shortRows).toHaveLength(1);
      expect(shortRows[0]).toMatchObject({
        guestStayId: STAY,
        tokenVersion: 2,
      });
      expect(shortRows[0].codeHash).not.toContain(code);
    });

    it('el código se canjea por un token verificable de la misma estancia', async () => {
      const { service } = harness({});
      const tokens = new GuestTokenService(config);

      const { url } = await service.issue({ id: STAY, tokenVersion: 3 });
      const redeemed = await service.redeem(url.split('/').pop()!);

      expect(redeemed).toMatchObject({ stayId: STAY, tokenVersion: 3 });
      expect(tokens.verify(redeemed!.token)).toMatchObject({
        stayId: STAY,
        tokenVersion: 3,
      });
    });

    it('un código desconocido o mal formado no se canjea', async () => {
      const { service } = harness({});

      await expect(service.redeem('ZZZZZZZZZZ')).resolves.toBeNull();
      await expect(service.redeem('../../etc')).resolves.toBeNull();
    });

    it('el token es verificable por GuestTokenService', async () => {
      const { service } = harness({});
      const tokens = new GuestTokenService(config);

      const { token } = await service.issue({ id: STAY, tokenVersion: 3 });

      expect(tokens.verify(token)).toMatchObject({
        stayId: STAY,
        tokenVersion: 3,
      });
    });
  });

  describe('entrega', () => {
    it('manda al canal el payload con la URL y sin PIN ni token suelto', async () => {
      const { service, send } = harness({});

      await service.deliver(stayWith());

      const [payload] = send.mock.calls[0] as [Record<string, unknown>];

      expect(payload.event).toBe('guest-link.issued');
      expect((payload.stay as Record<string, unknown>).guestName).toBe(
        'Bruno Salas',
      );
      expect((payload.link as Record<string, string>).url).toContain(
        'https://dt4fm.example.com/g/',
      );
      expect(JSON.stringify(payload)).not.toContain('"pin"');
      expect(payload).not.toHaveProperty('token');
    });

    it('incluye el canal de la reserva para que el canal compuesto pueda enrutar', async () => {
      const { service, send } = harness({});

      await service.deliver(stayWith({ channelName: 'direct' }));

      const [payload] = send.mock.calls[0] as [Record<string, unknown>];

      expect((payload.stay as Record<string, unknown>).channelName).toBe(
        'direct',
      );
    });

    it('registra el canal que realmente entregó cuando el canal delega', async () => {
      const { service, save } = harness({
        sendResult: {
          success: true,
          channel: 'email',
          target: 'bruno@example.com',
        },
      });

      const resultado = await service.deliver(stayWith());

      expect(resultado.channel).toBe('email');
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'email', status: 'sent' }),
      );
    });

    it('registra el envío correcto', async () => {
      const { service, save } = harness({});

      const resultado = await service.deliver(stayWith());

      expect(resultado.outcome).toBe('sent');
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          guestStayId: STAY,
          tokenVersion: 1,
          channel: 'webhook',
          status: 'sent',
          httpStatus: 200,
        }),
      );
    });

    it('se salta el envío si ya hubo uno correcto con la misma versión', async () => {
      const { service, send, save } = harness({ alreadySent: true });

      const resultado = await service.deliver(stayWith());

      // Es lo que evita reenviar el enlace cada vez que Hostaway modifica la
      // reserva: el enlace ya entregado sigue valiendo.
      expect(resultado.outcome).toBe('skipped');
      expect(send).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('con force reenvía aunque ya se hubiera enviado', async () => {
      const { service, send } = harness({ alreadySent: true });

      const resultado = await service.deliver(stayWith(), { force: true });

      expect(resultado.outcome).toBe('sent');
      expect(send).toHaveBeenCalledTimes(1);
    });

    describe('espera entre reintentos', () => {
      const failedAgo = (ms: number): Partial<GuestLinkDelivery> => ({
        status: 'failed',
        createdAt: new Date(Date.now() - ms),
      });

      it('no reintenta un fallo reciente', async () => {
        const { service, send, save } = harness({
          lastDelivery: failedAgo(5 * 60 * 1000),
        });

        // Hostaway manda varios reservation.updated seguidos: sin esto, cada
        // uno volvería a pegarle al canal.
        const resultado = await service.deliver(stayWith());

        expect(resultado.outcome).toBe('skipped');
        expect(resultado.error).toBe('retry_cooldown');
        expect(send).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      });

      it('reintenta cuando el fallo ya es viejo', async () => {
        const { service, send } = harness({
          lastDelivery: failedAgo(2 * HOUR),
        });

        const resultado = await service.deliver(stayWith());

        expect(resultado.outcome).toBe('sent');
        expect(send).toHaveBeenCalledTimes(1);
      });

      it('con GUEST_LINK_RETRY_COOLDOWN_MINUTES=0 reintenta siempre', async () => {
        const { service, send } = harness({
          lastDelivery: failedAgo(1000),
          config: configWith({ GUEST_LINK_RETRY_COOLDOWN_MINUTES: '0' }),
        });

        const resultado = await service.deliver(stayWith());

        expect(resultado.outcome).toBe('sent');
        expect(send).toHaveBeenCalledTimes(1);
      });

      it('con force reintenta aunque el fallo sea reciente', async () => {
        const { service, send } = harness({
          lastDelivery: failedAgo(1000),
        });

        const resultado = await service.deliver(stayWith(), { force: true });

        expect(resultado.outcome).toBe('sent');
        expect(send).toHaveBeenCalledTimes(1);
      });
    });

    it('un canal que falla deja constancia y no lanza', async () => {
      const { service, save } = harness({
        sendResult: {
          success: false,
          target: 'https://ejemplo.test/hook',
          httpStatus: 503,
          error: 'status=503',
        },
      });

      const resultado = await service.deliver(stayWith());

      expect(resultado.outcome).toBe('failed');
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', httpStatus: 503 }),
      );
    });

    it('un canal que lanza tampoco tumba a quien llama', async () => {
      const { service, save } = harness({ sendThrows: true });

      // El contrato dice que el canal no lanza, pero un canal nuevo mal hecho no
      // puede impedir que la estancia y su PIN existan.
      const resultado = await service.deliver(stayWith());

      expect(resultado.outcome).toBe('failed');
      expect(resultado.error).toBe('canal roto');
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', error: 'canal roto' }),
      );
    });
  });
});
