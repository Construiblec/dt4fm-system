import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../../integrations/openmaint/openmaint.client';
import { MailerService } from './mailer.service';
import type { MailMessage, MailProvider } from './mail-provider.interface';

const BUZON_PRUEBAS = 'pruebas@construiblec.cloud';

const mensaje: MailMessage = {
  to: 'propietario@example.com',
  subject: 'Recordatorio de pago',
  html: '<p>Hola</p>',
};

// Los dobles se guardan como `jest.fn()` sueltos, no como métodos de
// `jest.Mocked<Clase>`, para que las aserciones no disparen unbound-method.
const buildHarness = (env: Record<string, string> = {}) => {
  const send = jest.fn((m: MailMessage) =>
    Promise.resolve({ to: m.to, success: true, messageId: 'msg-1' }),
  );
  const provider = {
    name: 'smtp',
    send,
    verify: jest.fn(),
  } as unknown as MailProvider;

  const post = jest.fn().mockResolvedValue({ success: true });
  const openmaintClient = { post } as unknown as OpenmaintClient;

  const openmaintAuthService = {
    login: jest.fn().mockResolvedValue({ data: { _id: 'sesion-servicio' } }),
  } as unknown as OpenmaintAuthService;

  const config = {
    get: (key: string) =>
      ({
        MAIL_THROTTLE_MS: '0',
        HISTORIAL_EMAIL_ENABLED: 'false',
        ...env,
      })[key],
  } as unknown as ConfigService;

  return {
    mailer: new MailerService(
      provider,
      config,
      openmaintClient,
      openmaintAuthService,
    ),
    send,
    post,
  };
};

describe('MailerService', () => {
  it('sin MAIL_REDIRECT_TO entrega al destinatario original', async () => {
    const { mailer, send } = buildHarness();

    const resultado = await mailer.sendOne(mensaje);

    expect(send).toHaveBeenCalledWith(mensaje);
    expect(resultado).toEqual({
      to: 'propietario@example.com',
      success: true,
      messageId: 'msg-1',
    });
  });

  it('con MAIL_REDIRECT_TO entrega al buzón de pruebas y el asunto dice a quién iba', async () => {
    const { mailer, send } = buildHarness({ MAIL_REDIRECT_TO: BUZON_PRUEBAS });

    await mailer.sendOne(mensaje);

    expect(send).toHaveBeenCalledWith({
      ...mensaje,
      to: BUZON_PRUEBAS,
      subject: '[Para: propietario@example.com] Recordatorio de pago',
    });
  });

  it('con MAIL_REDIRECT_TO devuelve el destinatario que pidió quien llama', async () => {
    const { mailer } = buildHarness({ MAIL_REDIRECT_TO: BUZON_PRUEBAS });

    const resultado = await mailer.sendOne(mensaje);

    expect(resultado.to).toBe('propietario@example.com');
    expect(resultado.success).toBe(true);
  });

  it('un MAIL_REDIRECT_TO en blanco no redirige', async () => {
    const { mailer, send } = buildHarness({ MAIL_REDIRECT_TO: '   ' });

    await mailer.sendOne(mensaje);

    expect(send).toHaveBeenCalledWith(mensaje);
  });

  it('el envío masivo también pasa por la redirección', async () => {
    const { mailer, send } = buildHarness({ MAIL_REDIRECT_TO: BUZON_PRUEBAS });

    await mailer.sendBulk([
      mensaje,
      { ...mensaje, to: 'inquilino@example.com' },
    ]);

    const destinos = send.mock.calls.map(([m]) => m.to);
    expect(destinos).toEqual([BUZON_PRUEBAS, BUZON_PRUEBAS]);
  });

  it('HistorialEmail registra a quién salió de verdad el correo', async () => {
    const { mailer, post } = buildHarness({
      MAIL_REDIRECT_TO: BUZON_PRUEBAS,
      HISTORIAL_EMAIL_ENABLED: 'true',
      OPENMAINT_USERNAME: 'servicio',
      OPENMAINT_PASSWORD: 'secreto',
    });

    await mailer.sendOne(mensaje);

    expect(post).toHaveBeenCalledWith(
      '/classes/HistorialEmail/cards',
      expect.objectContaining({
        Para: BUZON_PRUEBAS,
        Asunto: '[Para: propietario@example.com] Recordatorio de pago',
      }),
      'sesion-servicio',
    );
  });
});
