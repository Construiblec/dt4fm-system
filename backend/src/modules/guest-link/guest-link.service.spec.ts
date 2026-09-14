import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  GuestLinkChannel,
  GuestLinkSendResult,
} from './delivery/guest-link-channel.interface';
import { GuestLinkDelivery } from './entities/guest-link-delivery.entity';
import { GuestLinkService, GuestLinkStayInput } from './guest-link.service';
import { GuestTokenService } from './guest-token.service';

const HOUR = 60 * 60 * 1000;
const STAY = 'c47ca6f1-f675-4653-a3a6-31487feb054b';

const config = {
  get: (key: string) =>
    ({
      GUEST_MAGICLINK_SECRET: 'secreto-de-pruebas-suficientemente-largo',
      APP_BASE_URL: 'https://dt4fm.example.com/',
    })[key],
} as unknown as ConfigService;

const stayWith = (
  overrides: Partial<GuestLinkStayInput> = {},
): GuestLinkStayInput => ({
  id: STAY,
  tokenVersion: 1,
  hostawayReservationId: '90000002',
  guestName: 'Bruno Salas',
  guestEmail: 'bruno@example.com',
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
};

const harness = (options: {
  alreadySent?: boolean;
  sendResult?: GuestLinkSendResult;
  sendThrows?: boolean;
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
  const save = jest
    .fn()
    .mockImplementation((row: unknown) => Promise.resolve(row));

  const channel = { name: 'webhook', send } as unknown as GuestLinkChannel;
  const deliveries = {
    exists,
    save,
    create: (row: unknown) => row,
  } as unknown as Repository<GuestLinkDelivery>;

  return {
    send,
    exists,
    save,
    service: new GuestLinkService(
      deliveries,
      new GuestTokenService(config),
      channel,
      config,
    ),
  };
};

describe('GuestLinkService', () => {
  describe('emisión', () => {
    it('arma la URL del portal sin doble barra y con el token', () => {
      const { service } = harness({});

      const { url, token } = service.issue({ id: STAY, tokenVersion: 1 });

      expect(url).toBe(
        `https://dt4fm.example.com/guest/dashboard?token=${encodeURIComponent(token)}`,
      );
    });

    it('el token es verificable por GuestTokenService', () => {
      const { service } = harness({});
      const tokens = new GuestTokenService(config);

      const { token } = service.issue({ id: STAY, tokenVersion: 3 });

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
        '/guest/dashboard?token=',
      );
      expect(JSON.stringify(payload)).not.toContain('"pin"');
      expect(payload).not.toHaveProperty('token');
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
