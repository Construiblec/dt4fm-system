import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';

const setup = () => {
  const guestStay = {
    upsertFromReservation: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const sync = { signal: jest.fn() };
  const controller = new ReservationsController(
    guestStay as never,
    sync as never,
  );
  return { controller, guestStay, sync };
};

const event = (data: object, over: object = {}) =>
  ({
    object: 'reservation',
    event: 'reservation.updated',
    data: {
      id: 123,
      listingMapId: 9,
      arrivalDate: '2026-11-20',
      departureDate: '2026-11-25',
      status: 'modified',
      ...data,
    },
    ...over,
  }) as never;

describe('ReservationsController (señal a las limpiezas)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('avisa con el id interno y responde igual', async () => {
    const t = setup();
    await expect(
      t.controller.receive(event({ hostawayReservationId: '456' })),
    ).resolves.toEqual({ received: true, processed: true });
    expect(t.sync.signal).toHaveBeenCalledWith('456');
  });

  it('avisa aunque falten las fechas', async () => {
    const t = setup();
    await expect(
      t.controller.receive(event({ departureDate: undefined })),
    ).resolves.toEqual({ received: true, processed: false });
    expect(t.sync.signal).toHaveBeenCalledWith('123');
    expect(t.guestStay.upsertFromReservation).not.toHaveBeenCalled();
  });

  it('avisa aunque la proyección falle', async () => {
    const t = setup();
    t.guestStay.upsertFromReservation.mockRejectedValue(new Error('pg'));
    await expect(t.controller.receive(event({}))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(t.sync.signal).toHaveBeenCalledTimes(1);
  });

  it('sin id o con otro tipo de evento no avisa', async () => {
    const t = setup();
    await t.controller.receive(event({ id: undefined }));
    await t.controller.receive(event({}, { object: 'conversationMessage' }));
    expect(t.sync.signal).not.toHaveBeenCalled();
  });
});
