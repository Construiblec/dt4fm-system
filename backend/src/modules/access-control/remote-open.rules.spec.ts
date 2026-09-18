import {
  aggregateOutcome,
  effectiveStatus,
  guestGateEligibility,
  STALE_ATTEMPT_MS,
} from './remote-open.rules';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-09-18T15:00:00.000Z');

const estancia = (overrides: Record<string, unknown> = {}) => ({
  stayStatus: 'active' as const,
  accessValidFrom: new Date(now.getTime() - 24 * HOUR),
  accessValidTo: new Date(now.getTime() + 24 * HOUR),
  hasVehicularAccess: true,
  ...overrides,
});

describe('reglas de apertura remota', () => {
  describe('guestGateEligibility', () => {
    it('permite abrir durante la estadía con acceso vehicular', () => {
      expect(guestGateEligibility(estancia(), now)).toBe('ok');
    });

    it('rechaza una reserva cancelada', () => {
      expect(
        guestGateEligibility(estancia({ stayStatus: 'cancelled' }), now),
      ).toBe('cancelada');
    });

    it('rechaza antes de que empiece la ventana de acceso', () => {
      expect(
        guestGateEligibility(
          estancia({ accessValidFrom: new Date(now.getTime() + HOUR) }),
          now,
        ),
      ).toBe('antes-del-checkin');
    });

    it('rechaza cuando la ventana de acceso ya terminó', () => {
      expect(
        guestGateEligibility(
          estancia({ accessValidTo: new Date(now.getTime() - HOUR) }),
          now,
        ),
      ).toBe('finalizada');
    });

    it('rechaza una credencial solo peatonal', () => {
      expect(
        guestGateEligibility(estancia({ hasVehicularAccess: false }), now),
      ).toBe('sin-vehicular');
    });
  });

  describe('effectiveStatus', () => {
    it('un attempted reciente sigue en curso', () => {
      expect(
        effectiveStatus(
          { status: 'attempted', requestedAt: new Date(now.getTime() - 1000) },
          now,
        ),
      ).toBe('attempted');
    });

    it('un attempted viejo murió a medias: es incierto', () => {
      expect(
        effectiveStatus(
          {
            status: 'attempted',
            requestedAt: new Date(now.getTime() - STALE_ATTEMPT_MS - 1),
          },
          now,
        ),
      ).toBe('uncertain');
    });

    it('un estado cerrado no cambia con el tiempo', () => {
      expect(
        effectiveStatus(
          { status: 'opened', requestedAt: new Date(now.getTime() - HOUR) },
          now,
        ),
      ).toBe('opened');
    });
  });

  describe('aggregateOutcome', () => {
    it('basta con que una puerta abra', () => {
      expect(
        aggregateOutcome([
          { deviceId: 'A', outcome: 'failed', errorCode: 'device_unreachable' },
          { deviceId: 'B', outcome: 'opened' },
        ]).outcome,
      ).toBe('opened');
    });

    it('sin aperturas, un incierto pesa más que un fallo', () => {
      expect(
        aggregateOutcome([
          { deviceId: 'A', outcome: 'failed' },
          { deviceId: 'B', outcome: 'uncertain' },
        ]).outcome,
      ).toBe('uncertain');
    });

    it('si todo falla, conserva el código del fallo', () => {
      expect(
        aggregateOutcome([
          { deviceId: 'A', outcome: 'failed', errorCode: 'device_unreachable' },
        ]),
      ).toMatchObject({ outcome: 'failed', errorCode: 'device_unreachable' });
    });
  });
});
