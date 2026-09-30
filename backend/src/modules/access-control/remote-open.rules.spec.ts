import {
  effectivePhase,
  effectiveStatus,
  gateTimings,
  guestGateEligibility,
  isRemoteGate,
  pulseRefusal,
  STALE_ATTEMPT_MS,
} from './remote-open.rules';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-09-18T15:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const TIMINGS = { closeWindowMs: 40_000, autoCloseMs: 90_000 };

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
        guestGateEligibility(estancia({ accessValidTo: ago(HOUR) }), now),
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
        effectiveStatus({ status: 'attempted', requestedAt: ago(1000) }, now),
      ).toBe('attempted');
    });

    it('un attempted viejo murió a medias: es incierto', () => {
      expect(
        effectiveStatus(
          { status: 'attempted', requestedAt: ago(STALE_ATTEMPT_MS + 1) },
          now,
        ),
      ).toBe('uncertain');
    });

    it('un estado cerrado no cambia con el tiempo', () => {
      expect(
        effectiveStatus({ status: 'triggered', requestedAt: ago(HOUR) }, now),
      ).toBe('triggered');
    });
  });

  describe('gateTimings', () => {
    const raw = JSON.stringify({
      3025058: { closeWindowSeconds: 40, autoCloseSeconds: 90 },
      3019998: { closeWindowSeconds: 90, autoCloseSeconds: 60 },
    });

    it('lee los tiempos medidos del edificio', () => {
      expect(gateTimings(raw, 3025058)).toEqual(TIMINGS);
    });

    it('sin tiempos medidos no hay botón', () => {
      expect(gateTimings(undefined, 3025058)).toBeNull();
      expect(gateTimings('', 3025058)).toBeNull();
      expect(gateTimings(raw, 999)).toBeNull();
      expect(gateTimings(raw, null)).toBeNull();
      expect(gateTimings('{roto', 3025058)).toBeNull();
    });

    it('una ventana que no termina antes del cierre automático no vale', () => {
      expect(gateTimings(raw, 3019998)).toBeNull();
    });
  });

  it('solo la barrera vehicular admite trigger', () => {
    expect(isRemoteGate({ kind: 'barrier', scope: 'vehicular' })).toBe(true);
    expect(isRemoteGate({ kind: 'terminal', scope: 'pedestrian' })).toBe(false);
    expect(isRemoteGate({ kind: 'terminal', scope: 'vehicular' })).toBe(false);
  });

  describe('effectivePhase', () => {
    const abierta = (ms: number) => ({
      phase: 'open' as const,
      pulsedAt: ago(ms),
      updatedAt: ago(ms),
    });

    it('sin historial la barrera está lista', () => {
      expect(effectivePhase(null, null, TIMINGS, now)).toBe('ready');
    });

    it('tras abrir, primero la ventana de cierre, luego nadie, luego lista', () => {
      expect(effectivePhase(abierta(10_000), null, TIMINGS, now)).toBe(
        'closable',
      );
      expect(effectivePhase(abierta(40_000), null, TIMINGS, now)).toBe(
        'settling',
      );
      expect(effectivePhase(abierta(89_999), null, TIMINGS, now)).toBe(
        'settling',
      );
      expect(effectivePhase(abierta(90_000), null, TIMINGS, now)).toBe('ready');
    });

    it('uncertain no se libera con el tiempo', () => {
      expect(
        effectivePhase(
          { phase: 'uncertain', pulsedAt: ago(HOUR), updatedAt: ago(HOUR) },
          null,
          TIMINGS,
          now,
        ),
      ).toBe('uncertain');
    });

    it('una orden muerta a medias deja la barrera sin confirmar', () => {
      expect(
        effectivePhase(null, ago(STALE_ATTEMPT_MS + 1), TIMINGS, now),
      ).toBe('uncertain');
    });

    it('liberarla a mano después de la orden muerta la deja lista', () => {
      expect(
        effectivePhase(
          { phase: 'ready', pulsedAt: null, updatedAt: ago(1000) },
          ago(STALE_ATTEMPT_MS + 1),
          TIMINGS,
          now,
        ),
      ).toBe('ready');
    });
  });

  describe('pulseRefusal', () => {
    const huesped = { type: 'guest' as const, stayId: 'estancia-a' };
    const cav = { type: 'staff' as const };

    it('abrir solo desde ready', () => {
      expect(pulseRefusal('open', 'ready', huesped, null)).toBe('ok');
      expect(pulseRefusal('open', 'closable', huesped, 'estancia-b')).toBe(
        'en-uso',
      );
      expect(pulseRefusal('open', 'settling', cav, null)).toBe('bajando');
      expect(pulseRefusal('open', 'uncertain', cav, null)).toBe(
        'sin-confirmar',
      );
    });

    it('cerrar solo dentro de la ventana, y el huésped solo si la abrió él', () => {
      expect(pulseRefusal('close', 'closable', huesped, 'estancia-a')).toBe(
        'ok',
      );
      expect(pulseRefusal('close', 'closable', huesped, 'estancia-b')).toBe(
        'de-otro',
      );
      expect(pulseRefusal('close', 'closable', cav, 'estancia-b')).toBe('ok');
      expect(pulseRefusal('close', 'settling', cav, null)).toBe('sin-ventana');
      expect(pulseRefusal('close', 'ready', huesped, 'estancia-a')).toBe(
        'sin-ventana',
      );
    });
  });
});
