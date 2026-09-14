import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestStay } from '../access-control/entities/guest-stay.entity';
import {
  GuestPortalData,
  GuestPortalDataService,
} from '../access-control/guest-portal-data.service';
import { GuestLinkService } from '../guest-link/guest-link.service';
import { GuestTokenService } from '../guest-link/guest-token.service';
import { GuestPortalService } from './guest-portal.service';

const HOUR = 60 * 60 * 1000;
const STAY = 'c47ca6f1-f675-4653-a3a6-31487feb054b';

const config = {
  get: (key: string) =>
    ({
      GUEST_MAGICLINK_SECRET: 'secreto-de-pruebas-suficientemente-largo',
      APP_BASE_URL: 'https://dt4fm.example.com/',
    })[key],
} as unknown as ConfigService;

const stayWith = (overrides: Partial<GuestStay> = {}): GuestStay =>
  ({
    id: STAY,
    hostawayReservationId: '90000002',
    listingId: '288173',
    openmaintUnitId: 4242,
    buildingId: 3019998,
    guestName: 'Bruno Salas',
    guestEmail: 'bruno@example.com',
    guestLastNameHash: null,
    arrivalDate: '2026-09-11',
    departureDate: '2026-09-15',
    // Estadía en curso salvo que la prueba diga otra cosa.
    accessValidFrom: new Date(Date.now() - 24 * HOUR),
    accessValidTo: new Date(Date.now() + 48 * HOUR),
    status: 'active',
    tokenVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as GuestStay;

type Harness = {
  service: GuestPortalService;
  findStay: jest.Mock;
  getPortalData: jest.Mock;
  deliver: jest.Mock;
};

/**
 * `GuestLinkService` se dobla, pero su `issue()` usa el `GuestTokenService`
 * real: así los tokens que emite el harness son verificables por el mismo
 * servicio, que es lo que `resolve()` necesita.
 */
const harness = (stay: GuestStay | null): Harness => {
  const tokens = new GuestTokenService(config);
  const findStay = jest.fn().mockResolvedValue(stay);
  const getPortalData = jest
    .fn()
    .mockResolvedValue({ stayId: STAY } as GuestPortalData);
  const deliver = jest.fn().mockResolvedValue({
    outcome: 'sent',
    channel: 'webhook',
    target: 'https://ejemplo.test/hook',
  });

  const data = { findStay, getPortalData } as unknown as GuestPortalDataService;
  const guestLink = {
    isConfigured: () => tokens.isConfigured(),
    issue: (s: { id: string; tokenVersion: number }) => {
      const token = tokens.create(s.id, s.tokenVersion);
      return {
        token,
        url: `https://dt4fm.example.com/guest/dashboard?token=${encodeURIComponent(token)}`,
      };
    },
    deliver,
  } as unknown as GuestLinkService;

  return {
    findStay,
    getPortalData,
    deliver,
    service: new GuestPortalService(data, tokens, guestLink),
  };
};

describe('GuestPortalService', () => {
  describe('emisión del enlace', () => {
    it('apunta al portal del frontend y no deja doble barra', async () => {
      const { service } = harness(stayWith());

      const link = await service.issueLink(STAY);

      expect(link.url).toBe(
        `https://dt4fm.example.com/guest/dashboard?token=${encodeURIComponent(link.token)}`,
      );
    });

    it('no emite enlace para una estancia que no existe', async () => {
      const { service } = harness(null);

      await expect(service.issueLink(STAY)).rejects.toThrow(NotFoundException);
    });

    it('no emite enlace para una estancia cancelada', async () => {
      const { service } = harness(stayWith({ status: 'cancelled' }));

      await expect(service.issueLink(STAY)).rejects.toThrow(NotFoundException);
    });

    it('no emite enlace para una estancia que ya terminó', async () => {
      const { service } = harness(
        stayWith({ accessValidTo: new Date(Date.now() - HOUR) }),
      );

      await expect(service.issueLink(STAY)).rejects.toThrow(NotFoundException);
    });
  });

  describe('envío manual', () => {
    it('fuerza el envío aunque ya se hubiera enviado', async () => {
      const stay = stayWith();
      const { service, deliver } = harness(stay);

      const resultado = await service.deliverLink(STAY);

      expect(resultado.outcome).toBe('sent');
      expect(deliver).toHaveBeenCalledWith(stay, { force: true });
    });

    it('aplica las mismas comprobaciones que la emisión', async () => {
      const { service, deliver } = harness(stayWith({ status: 'cancelled' }));

      await expect(service.deliverLink(STAY)).rejects.toThrow(
        NotFoundException,
      );
      expect(deliver).not.toHaveBeenCalled();
    });
  });

  describe('canje del enlace', () => {
    it('devuelve los datos del portal con un enlace vigente', async () => {
      const { service, getPortalData } = harness(stayWith());
      const { token } = await service.issueLink(STAY);

      await expect(service.resolve(token)).resolves.toMatchObject({
        stayId: STAY,
      });
      expect(getPortalData).toHaveBeenCalledTimes(1);
    });

    it('abre antes del check-in: el enlace vale aunque el PIN no toque aún', async () => {
      // Llega mañana: la ventana de acceso todavía no empezó.
      const { service } = harness(
        stayWith({
          accessValidFrom: new Date(Date.now() + 24 * HOUR),
          accessValidTo: new Date(Date.now() + 96 * HOUR),
          status: 'pending',
        }),
      );

      const { token } = await service.issueLink(STAY);

      await expect(service.resolve(token)).resolves.toBeDefined();
    });

    it('rechaza un token que no emitimos nosotros', async () => {
      const { service } = harness(stayWith());

      await expect(service.resolve('inventado.deltodo')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deja de abrir cuando se sube token_version', async () => {
      const stay = stayWith();
      const { service, findStay } = harness(stay);
      const { token } = await service.issueLink(STAY);

      // Freno de emergencia: invalida todos los enlaces de esa estancia.
      findStay.mockResolvedValue(stayWith({ tokenVersion: 2 }));

      await expect(service.resolve(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deja de abrir si la reserva se cancela después de emitir el enlace', async () => {
      const { service, findStay } = harness(stayWith());
      const { token } = await service.issueLink(STAY);

      findStay.mockResolvedValue(stayWith({ status: 'cancelled' }));

      await expect(service.resolve(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deja de abrir cuando pasa el fin del acceso', async () => {
      const { service, findStay } = harness(stayWith());
      const { token } = await service.issueLink(STAY);

      findStay.mockResolvedValue(
        stayWith({ accessValidTo: new Date(Date.now() - HOUR) }),
      );

      await expect(service.resolve(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('el MISMO enlace sigue valiendo si se extiende el check-out', async () => {
      // El requisito que obligó a sacar las fechas del token: se emite con una
      // salida, se extiende después, y el enlace ya entregado la acompaña.
      const { service, findStay } = harness(
        stayWith({ accessValidTo: new Date(Date.now() + HOUR) }),
      );
      const { token } = await service.issueLink(STAY);

      findStay.mockResolvedValue(
        stayWith({ accessValidTo: new Date(Date.now() + 72 * HOUR) }),
      );

      await expect(service.resolve(token)).resolves.toBeDefined();
    });

    it('no delata el motivo del rechazo', async () => {
      const emisor = harness(stayWith());
      const { token } = await emisor.service.issueLink(STAY);

      const cancelada = harness(stayWith({ status: 'cancelled' }));
      const vencida = harness(
        stayWith({ accessValidTo: new Date(Date.now() - HOUR) }),
      );
      const version = harness(stayWith({ tokenVersion: 7 }));

      const mensajes = await Promise.all(
        [cancelada, vencida, version].map((h) =>
          h.service.resolve(token).catch((error: Error) => error.message),
        ),
      );

      expect(new Set(mensajes).size).toBe(1);
    });
  });
});
