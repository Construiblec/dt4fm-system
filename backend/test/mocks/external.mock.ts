/**
 * Mocks de las salidas que NO son openMAINT: correo, Contifico, Hostaway, y
 * los dos providers de más alto nivel (NotificationsService,
 * PushDispatchService) para las suites que no los están probando ellos
 * mismos.
 */

// ─── MailerService ──────────────────────────────────────────────────────────

export const createMailerServiceMock = () => ({
  sendOne: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-id' }),
  sendBulk: jest
    .fn()
    .mockResolvedValue({ total: 0, sent: 0, failed: 0, errors: [] }),
  verifyProvider: jest.fn().mockResolvedValue(true),
});

export type MailerServiceMock = ReturnType<typeof createMailerServiceMock>;

// ─── ContificoService ───────────────────────────────────────────────────────

export const createContificoServiceMock = () => ({
  createDocumento: jest.fn().mockResolvedValue({
    id: 'mock-doc-id',
    documento: '001-001-000000001',
    estado: 'A',
  }),
  getDocumento: jest.fn().mockResolvedValue({ id: 'mock-doc-id', estado: 'A' }),
});

export type ContificoServiceMock = ReturnType<
  typeof createContificoServiceMock
>;

// ─── HostawayService ────────────────────────────────────────────────────────

export const createHostawayServiceMock = () => ({
  getCheckouts: jest.fn().mockResolvedValue({ result: [] }),
  getReservationsByArrivalDate: jest.fn().mockResolvedValue([]),
  getCheckoutsByDate: jest.fn().mockResolvedValue({ result: [] }),
});

export type HostawayServiceMock = ReturnType<typeof createHostawayServiceMock>;

// ─── NotificationsService ───────────────────────────────────────────────────
// Para las suites que dependen de él (incidents, password-recovery) sin
// probarlo directamente. La suite propia de `notifications` NO usa este mock:
// prueba el servicio real, mockeando MailerService por debajo.

export const createNotificationsServiceMock = () => ({
  sendBulk: jest
    .fn()
    .mockResolvedValue({ total: 0, sent: 0, failed: 0, errors: [] }),
  massSend: jest
    .fn()
    .mockResolvedValue({ total: 0, sent: 0, failed: 0, errors: [] }),
  notifyIncidentCreated: jest.fn().mockResolvedValue(true),
  notifyIncidentFinished: jest.fn().mockResolvedValue(true),
  verifyMailProvider: jest.fn().mockResolvedValue({ ok: true }),
  diagnoseSMTP: jest.fn().mockResolvedValue({}),
});

export type NotificationsServiceMock = ReturnType<
  typeof createNotificationsServiceMock
>;

// ─── PushDispatchService ────────────────────────────────────────────────────
// Se mockea SIEMPRE, incluida la suite de push-notifications: sus propios
// endpoints (/push/subscribe, /push/notifications, …) no pasan por aquí —
// PushDispatchService solo lo consumen OTROS módulos para avisar. Dejarlo
// real escribiría filas de notifications/notification_dispatch_log desde
// suites que no tienen nada que ver con push, contaminando esa tabla para la
// suite que sí las cuenta.

export const createPushDispatchServiceMock = () => ({
  notifyCorrectiveOpened: jest.fn().mockResolvedValue(undefined),
  notifyCorrectiveAssigned: jest.fn().mockResolvedValue(undefined),
  notifyCorrectiveCompleted: jest.fn().mockResolvedValue(undefined),
  notifyPreventivePlanning: jest.fn().mockResolvedValue(undefined),
  notifyPreventiveAssigned: jest.fn().mockResolvedValue(undefined),
  notifyPreventiveSuspended: jest.fn().mockResolvedValue(undefined),
  notifyPreventiveResumed: jest.fn().mockResolvedValue(undefined),
  notifyCleaningAssigned: jest.fn().mockResolvedValue(undefined),
  notifyCleaningDelayed: jest.fn().mockResolvedValue(undefined),
  notifyCleaningCompleted: jest.fn().mockResolvedValue(undefined),
  claimDispatch: jest.fn().mockResolvedValue(true),
});

export type PushDispatchServiceMock = ReturnType<
  typeof createPushDispatchServiceMock
>;
