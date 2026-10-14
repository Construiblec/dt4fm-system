import { of, throwError } from 'rxjs';
import { HostawayService } from './hostaway.service';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as never;

const REAL = {
  HOSTAWAY_USE_MOCK: 'false',
  HOSTAWAY_CLIENT_ID: 'id',
  HOSTAWAY_CLIENT_SECRET: 'secret',
};

const buildService = (get: jest.Mock) => {
  const httpService = {
    post: jest
      .fn()
      .mockReturnValue(
        of({ data: { access_token: 'token', expires_in: 3600 } }),
      ),
    get,
  };
  return new HostawayService(httpService as never, config(REAL));
};

const reservation = (over: object = {}) => ({
  id: 67469867,
  hostawayReservationId: '67469867',
  status: 'new',
  listingName: 'R315',
  listingMapId: 441669,
  departureDate: '2026-10-14',
  ...over,
});

describe('HostawayService', () => {
  describe('getCheckouts', () => {
    it('le pide a Hostaway que filtre por fecha de salida', async () => {
      const get = jest
        .fn()
        .mockReturnValue(of({ data: { result: [reservation()] } }));
      const service = buildService(get);

      const response = await service.getCheckouts('2026-10-14', '2026-10-14');

      // checkOutDateFrom/To no existen en la API: Hostaway los ignoraba y había
      // que recorrer 2.500 reservas.
      const params = get.mock.calls[0][1].params;
      expect(params).toMatchObject({
        departureStartDate: '2026-10-14',
        departureEndDate: '2026-10-14',
      });
      expect(params).not.toHaveProperty('checkOutDateFrom');
      expect(get).toHaveBeenCalledTimes(1);
      expect(response.result).toHaveLength(1);
    });
  });

  describe('getReservationCheckout', () => {
    it('devuelve la fecha de salida actual de la reserva', async () => {
      const get = jest
        .fn()
        .mockReturnValue(
          of({
            data: { result: reservation({ departureDate: '2026-10-30' }) },
          }),
        );
      const service = buildService(get);

      await expect(service.getReservationCheckout('67469867')).resolves.toEqual(
        {
          reservationId: '67469867',
          listingName: 'R315',
          listingId: '441669',
          checkoutDate: '2026-10-30',
        },
      );
      expect(get.mock.calls[0][0]).toBe(
        'https://api.hostaway.com/v1/reservations/67469867',
      );
    });

    it('una reserva cancelada cuenta como que ya no está', async () => {
      const get = jest
        .fn()
        .mockReturnValue(
          of({ data: { result: reservation({ status: 'cancelled' }) } }),
        );

      await expect(
        buildService(get).getReservationCheckout('67469867'),
      ).resolves.toBeNull();
    });

    it('si Hostaway falla devuelve null en vez de tumbar la vista previa', async () => {
      const get = jest
        .fn()
        .mockReturnValue(
          throwError(() =>
            Object.assign(new Error('Not Found'), {
              response: { status: 404 },
            }),
          ),
        );

      await expect(
        buildService(get).getReservationCheckout('1'),
      ).resolves.toBeNull();
    });
  });
});
