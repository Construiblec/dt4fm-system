import { ServiceUnavailableException } from '@nestjs/common';
import { HostawayService } from '../../../integrations/hostaway/hostaway.service';
import { GuestLinkPayload } from './guest-link-channel.interface';
import {
  buildGuestLinkMessage,
  CONVERSATION_NOT_FOUND,
  HostawayMessageLinkChannel,
} from './hostaway-message-link.channel';

const URL = 'https://dt4fm.example.com/guest/dashboard?token=abc.def';

const payload: GuestLinkPayload = {
  event: 'guest-link.issued',
  issuedAt: '2026-09-14T13:40:00.000Z',
  stay: {
    id: 'c47ca6f1-f675-4653-a3a6-31487feb054b',
    reservationId: '90000002',
    guestName: 'Bruno Salas',
    guestEmail: null,
    channelName: 'airbnbOfficial',
    arrivalDate: '2026-09-13',
    departureDate: '2026-09-17',
    accessValidFrom: '2026-09-13T17:00:00.000Z',
    accessValidTo: '2026-09-17T19:00:00.000Z',
    buildingId: 3019998,
    openmaintUnitId: 4242,
  },
  link: { url: URL },
};

const hostawayWith = (overrides: Partial<Record<string, jest.Mock>> = {}) => {
  const findConversationByReservation = jest
    .fn()
    .mockResolvedValue({ id: 5551, reservationId: 90000002, channelId: 2018 });
  const sendConversationMessage = jest
    .fn()
    .mockResolvedValue({ messageId: 77 });

  const mocks = {
    findConversationByReservation,
    sendConversationMessage,
    ...overrides,
  };

  return { ...mocks, service: mocks as unknown as HostawayService };
};

describe('HostawayMessageLinkChannel', () => {
  it('busca la conversación de la reserva y publica el mensaje por el canal', async () => {
    const hostaway = hostawayWith();
    const channel = new HostawayMessageLinkChannel(hostaway.service);

    const resultado = await channel.send(payload);

    expect(hostaway.findConversationByReservation).toHaveBeenCalledWith(
      '90000002',
    );
    expect(hostaway.sendConversationMessage).toHaveBeenCalledWith(
      5551,
      expect.stringContaining(URL),
      'channel',
    );
    expect(resultado).toEqual({
      success: true,
      channel: 'hostaway-message',
      target: 'conversation:5551',
    });
  });

  it('el mensaje lleva la URL y nunca el PIN', () => {
    const texto = buildGuestLinkMessage(payload);

    expect(texto).toContain('Bruno Salas');
    expect(texto).toContain(URL);
    expect(texto.toLowerCase()).not.toContain('pin:');
    expect(texto).not.toMatch(/\b\d{4}\b/);
  });

  it('sin conversación devuelve un fallo reconocible para reintentar después', async () => {
    const hostaway = hostawayWith({
      findConversationByReservation: jest.fn().mockResolvedValue(null),
    });
    const channel = new HostawayMessageLinkChannel(hostaway.service);

    // Hostaway crea la conversación con la reserva, pero no siempre antes de
    // mandar el webhook.
    const resultado = await channel.send(payload);

    expect(resultado).toEqual({
      success: false,
      channel: 'hostaway-message',
      target: '',
      error: CONVERSATION_NOT_FOUND,
    });
    expect(hostaway.sendConversationMessage).not.toHaveBeenCalled();
  });

  it('un fallo de Hostaway se devuelve con su código, sin lanzar', async () => {
    const hostaway = hostawayWith({
      sendConversationMessage: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException('Hostaway rechazó el mensaje'),
        ),
    });
    const channel = new HostawayMessageLinkChannel(hostaway.service);

    const resultado = await channel.send(payload);

    expect(resultado.success).toBe(false);
    expect(resultado.channel).toBe('hostaway-message');
    expect(resultado.httpStatus).toBe(503);
    expect(resultado.error).toContain('Hostaway rechazó el mensaje');
  });

  it('un error que no es HTTP tampoco lanza', async () => {
    const hostaway = hostawayWith({
      findConversationByReservation: jest
        .fn()
        .mockRejectedValue(
          new Error('Credenciales de Hostaway no configuradas'),
        ),
    });
    const channel = new HostawayMessageLinkChannel(hostaway.service);

    const resultado = await channel.send(payload);

    expect(resultado.success).toBe(false);
    expect(resultado.httpStatus).toBeUndefined();
    expect(resultado.error).toContain('Credenciales de Hostaway');
  });
});
