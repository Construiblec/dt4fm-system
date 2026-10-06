import {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './guest-link-channel.interface';
import { isDirectReservation, RoutedLinkChannel } from './routed-link.channel';

const payloadWith = (
  stay: Partial<GuestLinkPayload['stay']> = {},
): GuestLinkPayload => ({
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
    ...stay,
  },
  link: { url: 'https://dt4fm.example.com/guest/dashboard?token=abc.def' },
});

const channelWith = (
  name: string,
  result: GuestLinkSendResult,
): GuestLinkChannel & { send: jest.Mock } => ({
  name,
  send: jest.fn().mockResolvedValue({ channel: name, ...result }),
});

const ok = (target: string): GuestLinkSendResult => ({ success: true, target });
const ko = (error: string): GuestLinkSendResult => ({
  success: false,
  target: '',
  error,
});

describe('isDirectReservation', () => {
  it.each(['direct', 'Direct', ' DIRECT ', '', null])(
    'trata %p como reserva directa',
    (channelName) => {
      expect(isDirectReservation(channelName)).toBe(true);
    },
  );

  it.each(['airbnbOfficial', 'bookingcom', 'vrboOfficial', 'expedia'])(
    'trata %p como reserva de canal',
    (channelName) => {
      expect(isDirectReservation(channelName)).toBe(false);
    },
  );
});

describe('RoutedLinkChannel', () => {
  it('una reserva directa va solo por correo', async () => {
    const mensaje = channelWith('hostaway-message', ok('conversation:1'));
    const correo = channelWith('email', ok('bruno@example.com'));
    const routed = new RoutedLinkChannel(mensaje, correo);

    const resultado = await routed.send(payloadWith({ channelName: 'direct' }));

    expect(mensaje.send).not.toHaveBeenCalled();
    expect(correo.send).toHaveBeenCalledTimes(1);
    expect(resultado.channel).toBe('email');
  });

  it('una reserva sin canal conocido también va por correo', async () => {
    const mensaje = channelWith('hostaway-message', ok('conversation:1'));
    const correo = channelWith('email', ok('bruno@example.com'));
    const routed = new RoutedLinkChannel(mensaje, correo);

    await routed.send(payloadWith({ channelName: null }));

    expect(mensaje.send).not.toHaveBeenCalled();
    expect(correo.send).toHaveBeenCalledTimes(1);
  });

  it('una reserva de canal va por mensaje de Hostaway y no toca el correo', async () => {
    const mensaje = channelWith('hostaway-message', ok('conversation:1'));
    const correo = channelWith('email', ok('bruno@example.com'));
    const routed = new RoutedLinkChannel(mensaje, correo);

    const resultado = await routed.send(payloadWith());

    expect(mensaje.send).toHaveBeenCalledTimes(1);
    expect(correo.send).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({
      success: true,
      channel: 'hostaway-message',
      target: 'conversation:1',
    });
  });

  it('si el mensaje falla y hay correo, entrega por correo', async () => {
    const mensaje = channelWith(
      'hostaway-message',
      ko('conversation_not_found'),
    );
    const correo = channelWith('email', ok('bruno@example.com'));
    const routed = new RoutedLinkChannel(mensaje, correo);

    const resultado = await routed.send(payloadWith());

    expect(correo.send).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({
      success: true,
      channel: 'email',
      target: 'bruno@example.com',
    });
  });

  it('si el mensaje falla y no hay correo, devuelve el fallo del mensaje', async () => {
    const mensaje = channelWith(
      'hostaway-message',
      ko('conversation_not_found'),
    );
    const correo = channelWith('email', ok('x'));
    const routed = new RoutedLinkChannel(mensaje, correo);

    // Airbnb no comparte el correo: no hay a qué recurrir, y el fallo debe
    // quedar registrado tal cual para reintentarlo después.
    const resultado = await routed.send(payloadWith({ guestEmail: null }));

    expect(correo.send).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({
      success: false,
      channel: 'hostaway-message',
      error: 'conversation_not_found',
    });
  });

  it('si fallan los dos, el error cuenta ambos motivos', async () => {
    const mensaje = channelWith('hostaway-message', ko('status=503'));
    const correo = channelWith('email', ko('SMTP 550'));
    const routed = new RoutedLinkChannel(mensaje, correo);

    const resultado = await routed.send(payloadWith());

    expect(resultado.success).toBe(false);
    expect(resultado.channel).toBe('email');
    expect(resultado.error).toBe(
      'hostaway-message: status=503 | email: SMTP 550',
    );
  });
});
