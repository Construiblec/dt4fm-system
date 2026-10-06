import { MailerService } from '../../notifications/mail/mailer.service';
import {
  buildGuestLinkEmailHtml,
  EmailLinkChannel,
  NO_EMAIL,
} from './email-link.channel';
import { GuestLinkPayload } from './guest-link-channel.interface';

const URL = 'https://dt4fm.example.com/guest/dashboard?token=abc.def';

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
    channelName: 'direct',
    arrivalDate: '2026-09-13',
    departureDate: '2026-09-17',
    accessValidFrom: '2026-09-13T17:00:00.000Z',
    accessValidTo: '2026-09-17T19:00:00.000Z',
    buildingId: 3019998,
    openmaintUnitId: 4242,
    ...stay,
  },
  link: { url: URL },
});

const mailerWith = (sendOne: jest.Mock) =>
  ({ sendOne }) as unknown as MailerService;

describe('EmailLinkChannel', () => {
  it('manda el correo al guestEmail con la URL en HTML y en texto', async () => {
    const sendOne = jest
      .fn()
      .mockResolvedValue({ to: 'bruno@example.com', success: true });
    const channel = new EmailLinkChannel(mailerWith(sendOne));

    const resultado = await channel.send(payloadWith());

    expect(sendOne).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bruno@example.com',
        html: expect.stringContaining(URL),
        text: expect.stringContaining(URL),
      }),
    );
    // La URL no va en el asunto: el asunto queda registrado en HistorialEmail.
    const [mensaje] = sendOne.mock.calls[0] as [{ subject: string }];
    expect(mensaje.subject).not.toContain('token=');

    expect(resultado).toEqual({
      success: true,
      channel: 'email',
      target: 'bruno@example.com',
      error: undefined,
    });
  });

  it('sin correo en la reserva no intenta nada', async () => {
    const sendOne = jest.fn();
    const channel = new EmailLinkChannel(mailerWith(sendOne));

    // Es el caso normal de Airbnb, que no comparte el correo del huésped.
    const resultado = await channel.send(payloadWith({ guestEmail: null }));

    expect(resultado).toEqual({
      success: false,
      channel: 'email',
      target: '',
      error: NO_EMAIL,
    });
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('un fallo del proveedor se devuelve con su motivo', async () => {
    const sendOne = jest.fn().mockResolvedValue({
      to: 'bruno@example.com',
      success: false,
      error: 'SMTP 550',
    });
    const channel = new EmailLinkChannel(mailerWith(sendOne));

    const resultado = await channel.send(payloadWith());

    expect(resultado).toEqual({
      success: false,
      channel: 'email',
      target: 'bruno@example.com',
      error: 'SMTP 550',
    });
  });

  it('un proveedor que lanza tampoco tumba a quien llama', async () => {
    const sendOne = jest.fn().mockRejectedValue(new Error('conexión caída'));
    const channel = new EmailLinkChannel(mailerWith(sendOne));

    const resultado = await channel.send(payloadWith());

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe('conexión caída');
  });

  it('escapa el nombre del huésped en el HTML', () => {
    const html = buildGuestLinkEmailHtml(
      payloadWith({ guestName: '<script>alert(1)</script>' }),
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
