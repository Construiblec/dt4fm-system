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
      const get = jest.fn().mockReturnValue(
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
      const get = jest.fn().mockReturnValue(
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
  describe('setReservationDoorCode', () => {
    const buildWithPut = (
      put: jest.Mock,
      values: Record<string, string> = REAL,
    ) =>
      new HostawayService(
        {
          post: jest
            .fn()
            .mockReturnValue(
              of({ data: { access_token: 'token', expires_in: 3600 } }),
            ),
          put,
        } as never,
        config(values),
      );

    it('escribe solo los tres campos del código en la reserva', async () => {
      const put = jest
        .fn()
        .mockReturnValue(of({ data: { status: 'success' } }));

      await buildWithPut(put).setReservationDoorCode(
        '70902133',
        '0000',
        'Teclado',
      );

      const [url, body, options] = put.mock.calls[0] as [
        string,
        object,
        { headers: Record<string, string> },
      ];
      expect(url).toBe('https://api.hostaway.com/v1/reservations/70902133');
      expect(body).toEqual({
        doorCode: '0000',
        doorCodeVendor: 'DT4F',
        doorCodeInstruction: 'Teclado',
      });
      expect(options.headers.Authorization).toBe('Bearer token');
    });

    it('con null borra los tres campos con cadena vacía (Hostaway ignora null)', async () => {
      const put = jest
        .fn()
        .mockReturnValue(of({ data: { status: 'success' } }));

      await buildWithPut(put).setReservationDoorCode(
        '70902133',
        null,
        'Teclado',
      );

      expect(put.mock.calls[0][1]).toEqual({
        doorCode: '',
        doorCodeVendor: '',
        doorCodeInstruction: '',
      });
    });

    it('un 200 con status fail es un error', async () => {
      const put = jest
        .fn()
        .mockReturnValue(
          of({ data: { status: 'fail', message: 'Not allowed' } }),
        );

      await expect(
        buildWithPut(put).setReservationDoorCode('1', '0000'),
      ).rejects.toThrow('Hostaway rechazó el doorCode: Not allowed');
    });

    it('no reintenta: el barrido se encarga', async () => {
      const put = jest
        .fn()
        .mockReturnValue(
          throwError(() =>
            Object.assign(new Error('boom'), { response: { status: 503 } }),
          ),
        );

      await expect(
        buildWithPut(put).setReservationDoorCode('1', '0000'),
      ).rejects.toThrow();
      expect(put).toHaveBeenCalledTimes(1);
    });

    it('en modo mock no sale a la red', async () => {
      const put = jest.fn();

      await buildWithPut(put, {
        HOSTAWAY_USE_MOCK: 'true',
      }).setReservationDoorCode('1', '0000');

      expect(put).not.toHaveBeenCalled();
    });
  });
});
