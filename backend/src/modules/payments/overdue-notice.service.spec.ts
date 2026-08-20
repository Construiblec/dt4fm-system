import { MailerService } from '../notifications/mail/mailer.service';
import { OverdueNoticeService } from './overdue-notice.service';
import {
  PagoCard,
  PaymentsOpenmaintRepository,
} from './payments-openmaint.repository';

const SESSION_ID = 'session-de-servicio';
const DIA_VENCIMIENTO = 20;

/** 15 de agosto de 2026: día de aviso. */
const HOY = new Date(2026, 7, 15, 9, 0, 0);

const pago = (overrides: Partial<PagoCard> = {}): PagoCard => ({
  _id: 1,
  Description: 'R101 - Departamento 101',
  Propietario: 3118136,
  Periodo: '2026-06',
  Monto: 72.35,
  ...overrides,
});

const buildHarness = (pendientes: PagoCard[]) => {
  const repo = {
    getSession: jest.fn().mockResolvedValue(SESSION_ID),
    getConfigExpensa: jest.fn().mockResolvedValue({
      DiaEmision: 16,
      DiaVencimiento: DIA_VENCIMIENTO,
      Tiempo: 2026,
    }),
    getPendingPayments: jest.fn().mockResolvedValue(pendientes),
    getTenantsEmailMap: jest
      .fn()
      .mockResolvedValue(new Map([[3118136, 'propietario@construiblec.cloud']])),
  } as unknown as jest.Mocked<PaymentsOpenmaintRepository>;

  const mailer = {
    sendBulk: jest
      .fn()
      .mockResolvedValue({ total: 1, sent: 1, failed: 0, results: [] }),
  } as unknown as jest.Mocked<MailerService>;

  return { service: new OverdueNoticeService(repo, mailer), repo, mailer };
};

describe('OverdueNoticeService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(HOY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('días de envío', () => {
    it.each([1, 15])('envía el día %i', async (dia) => {
      jest.setSystemTime(new Date(2026, 7, dia, 9, 0, 0));
      const { service, mailer } = buildHarness([pago()]);

      const result = await service.sendOverdueNotices();

      expect(result.skippedReason).toBeUndefined();
      expect(mailer.sendBulk).toHaveBeenCalledTimes(1);
    });

    it.each([2, 14, 16, 28])('no envía el día %i', async (dia) => {
      jest.setSystemTime(new Date(2026, 7, dia, 9, 0, 0));
      const { service, mailer, repo } = buildHarness([pago()]);

      const result = await service.sendOverdueNotices();

      expect(result.skippedReason).toContain('no es día de aviso');
      expect(mailer.sendBulk).not.toHaveBeenCalled();
      // Ni siquiera abre sesión con openMAINT si no toca.
      expect(repo.getSession).not.toHaveBeenCalled();
    });

    it('con force envía cualquier día', async () => {
      jest.setSystemTime(new Date(2026, 7, 7, 9, 0, 0));
      const { service, mailer } = buildHarness([pago()]);

      const result = await service.sendOverdueNotices(true);

      expect(result.skippedReason).toBeUndefined();
      expect(mailer.sendBulk).toHaveBeenCalledTimes(1);
    });
  });

  describe('qué cuenta como vencido', () => {
    it('incluye un período cuyo vencimiento ya pasó', async () => {
      // 2026-06 vence el 20/06; hoy es 15/08.
      const { service, mailer } = buildHarness([pago({ Periodo: '2026-06' })]);

      await service.sendOverdueNotices();

      expect(mailer.sendBulk).toHaveBeenCalledTimes(1);
    });

    it('excluye el período en curso, que aún no vence', async () => {
      // 2026-08 vence el 20/08; hoy es 15/08: pendiente pero NO vencido.
      const { service, mailer } = buildHarness([pago({ Periodo: '2026-08' })]);

      const result = await service.sendOverdueNotices();

      expect(result.propietariosConVencidos).toBe(0);
      expect(mailer.sendBulk).not.toHaveBeenCalled();
    });

    it('excluye el mismo día del vencimiento', async () => {
      // Hoy 20/08 y el período 2026-08 vence hoy: todavía no está vencido.
      jest.setSystemTime(new Date(2026, 7, 20, 9, 0, 0));
      const { service, mailer } = buildHarness([pago({ Periodo: '2026-08' })]);

      await service.sendOverdueNotices(true);

      expect(mailer.sendBulk).not.toHaveBeenCalled();
    });

    it('omite pagos con período ilegible', async () => {
      const { service, mailer } = buildHarness([
        pago({ Periodo: 'sin-formato' }),
      ]);

      const result = await service.sendOverdueNotices();

      expect(result.propietariosConVencidos).toBe(0);
      expect(mailer.sendBulk).not.toHaveBeenCalled();
    });
  });

  describe('contenido del correo', () => {
    it('agrupa por propietario y suma el total vencido', async () => {
      const { service, mailer } = buildHarness([
        pago({ _id: 1, Periodo: '2026-05', Monto: 50 }),
        pago({ _id: 2, Periodo: '2026-06', Monto: 72.35 }),
      ]);

      await service.sendOverdueNotices();

      const [mensajes] = mailer.sendBulk.mock.calls[0];
      expect(mensajes).toHaveLength(1);
      expect(mensajes[0].to).toBe('propietario@construiblec.cloud');
      expect(mensajes[0].html).toContain('$122.35');
      expect(mensajes[0].subject).toContain('2 expensas');
    });

    it('menciona la mora sin dar cifras', async () => {
      const { service, mailer } = buildHarness([pago()]);

      await service.sendOverdueNotices();

      const html = mailer.sendBulk.mock.calls[0][0][0].html ?? '';
      expect(html).toContain('Multa por mora');

      // El porcentaje no está configurado en openMAINT: no debe inventarse.
      // Se mira el texto visible, no el HTML: el CSS trae "width:100%".
      const textoVisible = html.replace(/<[^>]*>/g, ' ');
      expect(textoVisible).not.toMatch(/\d+\s*%/);
    });

    it('muestra la fecha de vencimiento derivada del período', async () => {
      const { service, mailer } = buildHarness([pago({ Periodo: '2026-06' })]);

      await service.sendOverdueNotices();

      const html = mailer.sendBulk.mock.calls[0][0][0].html ?? '';
      expect(html).toContain('20/06/2026');
    });
  });

  describe('casos borde', () => {
    it('no notifica a un propietario sin correo', async () => {
      const { service, repo, mailer } = buildHarness([pago()]);
      repo.getTenantsEmailMap.mockResolvedValue(new Map());

      const result = await service.sendOverdueNotices();

      expect(result.propietariosConVencidos).toBe(1);
      expect(result.emailsSkipped).toBe(1);
      expect(mailer.sendBulk).not.toHaveBeenCalled();
    });

    it('se detiene si no hay DiaVencimiento configurado', async () => {
      const { service, repo, mailer } = buildHarness([pago()]);
      repo.getConfigExpensa.mockResolvedValue(null);

      const result = await service.sendOverdueNotices();

      expect(result.skippedReason).toContain('DiaVencimiento');
      expect(mailer.sendBulk).not.toHaveBeenCalled();
    });
  });
});
