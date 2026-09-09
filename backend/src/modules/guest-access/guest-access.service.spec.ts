import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HostawayGuestReservation } from '../../integrations/hostaway/hostaway.mock';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { GuestAccessService } from './guest-access.service';
import { GuestTokenService } from './guest-token.service';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ENV: Record<string, string> = {
  GUEST_MAGICLINK_SECRET: 'secreto-de-pruebas-suficientemente-largo',
  APP_BASE_URL: 'https://dt4fm.example.com/',
};

const configWith = (extra: Record<string, string> = {}) =>
  ({
    get: (key: string) => ({ ...ENV, ...extra })[key],
  }) as unknown as ConfigService;

/** Fecha `YYYY-MM-DD` desplazada respecto de hoy. */
const isoDate = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY).toISOString().split('T')[0];

const reservationWith = (
  overrides: Partial<HostawayGuestReservation> = {},
): HostawayGuestReservation => ({
  id: 46157859,
  status: 'confirmed',
  guestName: 'Carlos Perezzz',
  guestEmail: 'huesped@example.com',
  listingName: 'Apto 101 - Torre A',
  listingMapId: 'UNIT-101',
  // Llegó ayer, se va en tres días: la ventana contiene el instante actual.
  arrivalDate: isoDate(-1),
  departureDate: isoDate(3),
  confirmationCode: 'HW-0001',
  nights: 4,
  ...overrides,
});

type Harness = {
  service: GuestAccessService;
  getReservationById: jest.Mock;
};

const harness = (
  reservation: HostawayGuestReservation | null,
  extraEnv: Record<string, string> = {},
): Harness => {
  const getReservationById = jest.fn().mockResolvedValue(reservation);
  const config = configWith(extraEnv);

  return {
    getReservationById,
    service: new GuestAccessService(
      { getReservationById } as unknown as HostawayService,
      new GuestTokenService(config),
      config,
    ),
  };
};

describe('GuestAccessService', () => {
  describe('emisión del enlace', () => {
    it('arma la ventana con 24 h antes del check-in y 24 h después del check-out', async () => {
      const reservation = reservationWith({
        arrivalDate: '2026-10-10',
        departureDate: '2026-10-14',
      });
      const { service } = harness(reservation);

      const link = await service.issueMagicLink(reservation.id);

      expect(link.notBefore).toBe(
        Date.parse('2026-10-10T00:00:00Z') - 24 * HOUR,
      );
      expect(link.expiresAt).toBe(
        Date.parse('2026-10-14T23:59:59Z') + 24 * HOUR,
      );
    });

    it('respeta los márgenes configurados', async () => {
      const reservation = reservationWith({
        arrivalDate: '2026-10-10',
        departureDate: '2026-10-14',
      });
      const { service } = harness(reservation, {
        GUEST_LINK_LEAD_HOURS: '2',
        GUEST_LINK_GRACE_HOURS: '72',
      });

      const link = await service.issueMagicLink(reservation.id);

      expect(link.notBefore).toBe(
        Date.parse('2026-10-10T00:00:00Z') - 2 * HOUR,
      );
      expect(link.expiresAt).toBe(
        Date.parse('2026-10-14T23:59:59Z') + 72 * HOUR,
      );
    });

    it('cae al valor por defecto si el margen configurado no es un número', async () => {
      const reservation = reservationWith({
        arrivalDate: '2026-10-10',
        departureDate: '2026-10-14',
      });
      const { service } = harness(reservation, {
        GUEST_LINK_LEAD_HOURS: 'un rato',
      });

      const link = await service.issueMagicLink(reservation.id);

      expect(link.notBefore).toBe(
        Date.parse('2026-10-10T00:00:00Z') - 24 * HOUR,
      );
    });

    it('recorta la ventana al tope de 60 días en una estadía muy larga', async () => {
      const reservation = reservationWith({
        arrivalDate: '2026-01-01',
        departureDate: '2026-12-31',
      });
      const { service } = harness(reservation);

      const link = await service.issueMagicLink(reservation.id);

      expect(link.expiresAt - link.notBefore).toBe(60 * DAY);
    });

    it('apunta al dashboard del frontend y no deja doble barra', async () => {
      const reservation = reservationWith();
      const { service } = harness(reservation);

      const link = await service.issueMagicLink(reservation.id);

      expect(link.url).toBe(
        `https://dt4fm.example.com/guest/dashboard?token=${encodeURIComponent(link.token)}`,
      );
    });

    it('no emite enlace para una reserva que no existe', async () => {
      const { service } = harness(null);

      await expect(service.issueMagicLink(1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('no emite enlace para una reserva cancelada', async () => {
      const reservation = reservationWith({ status: 'cancelled' });
      const { service } = harness(reservation);

      await expect(service.issueMagicLink(reservation.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('canje del enlace', () => {
    it('devuelve la reserva del huésped que abrió un enlace vigente', async () => {
      const reservation = reservationWith();
      const { service } = harness(reservation);

      const { token } = await service.issueMagicLink(reservation.id);

      await expect(service.resolve(token)).resolves.toMatchObject({
        reservationId: reservation.id,
        guestName: 'Carlos Perezzz',
        listingName: 'Apto 101 - Torre A',
        confirmationCode: 'HW-0001',
      });
    });

    it('rechaza un token que no emitimos nosotros', async () => {
      const { service } = harness(reservationWith());

      await expect(service.resolve('inventado.deltodo')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deja de abrir si la reserva se cancela después de emitir el enlace', async () => {
      const reservation = reservationWith();
      const { service, getReservationById } = harness(reservation);

      const { token } = await service.issueMagicLink(reservation.id);

      service.forget(reservation.id);
      getReservationById.mockResolvedValue({
        ...reservation,
        status: 'cancelled',
      });

      await expect(service.resolve(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deja de abrir si el huésped adelantó su salida', async () => {
      const reservation = reservationWith();
      const { service, getReservationById } = harness(reservation);

      const { token } = await service.issueMagicLink(reservation.id);

      // La salida pasa a hace tres días: la ventana recalculada ya venció,
      // aunque la que lleva grabada el token siga vigente.
      service.forget(reservation.id);
      getReservationById.mockResolvedValue({
        ...reservation,
        arrivalDate: isoDate(-7),
        departureDate: isoDate(-3),
      });

      await expect(service.resolve(token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('no vuelve a consultar Hostaway dentro de la ventana de caché', async () => {
      const reservation = reservationWith();
      const { service, getReservationById } = harness(reservation);

      const { token } = await service.issueMagicLink(reservation.id);
      const consultasTrasEmitir = getReservationById.mock.calls.length;

      await service.resolve(token);
      await service.resolve(token);
      await service.resolve(token);

      expect(getReservationById.mock.calls.length).toBe(
        consultasTrasEmitir + 1,
      );
    });

    it('no delata el motivo del rechazo', async () => {
      const vencido = harness(
        reservationWith({
          arrivalDate: '2020-01-01',
          departureDate: '2020-01-05',
        }),
      );
      const cancelado = harness(reservationWith({ status: 'cancelled' }));
      const emisor = harness(reservationWith());

      const { token } = await emisor.service.issueMagicLink(46157859);

      const mensajes = await Promise.all(
        [vencido.service, cancelado.service].map((service) =>
          service.resolve(token).catch((error: Error) => error.message),
        ),
      );

      expect(new Set(mensajes).size).toBe(1);
    });
  });
});
