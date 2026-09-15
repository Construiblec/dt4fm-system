import { ConfigService } from '@nestjs/config';
import {
  atLocalHour,
  checkInInstant,
  checkOutInstant,
  incidentEligibility,
  leadHours,
} from './guest-stay-timing';

const HOUR = 60 * 60 * 1000;

const configWith = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('guest-stay-timing', () => {
  describe('leadHours', () => {
    it('usa el valor configurado, incluido el 0', () => {
      expect(leadHours(configWith({ ACCESS_GUEST_LEAD_HOURS: '0' }))).toBe(0);
      expect(leadHours(configWith({ ACCESS_GUEST_LEAD_HOURS: '3' }))).toBe(3);
    });

    it('cae al valor por defecto si falta o no es válido', () => {
      expect(leadHours(configWith({}))).toBe(3);
      expect(leadHours(configWith({ ACCESS_GUEST_LEAD_HOURS: 'dos' }))).toBe(3);
      expect(leadHours(configWith({ ACCESS_GUEST_LEAD_HOURS: '40' }))).toBe(3);
    });
  });

  it('reconstruye el check-in y el check-out quitando los márgenes', () => {
    const from = atLocalHour('2026-09-14', 15, -3);
    const to = atLocalHour('2026-09-18', 11, 3);

    expect(checkInInstant(from, 3).toISOString()).toBe(
      '2026-09-14T20:00:00.000Z',
    );
    expect(checkOutInstant(to, 3).toISOString()).toBe(
      '2026-09-18T16:00:00.000Z',
    );
  });

  describe('incidentEligibility', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    const base = {
      stayStatus: 'active' as const,
      buildingId: 3019998,
      checkInAt: new Date(now.getTime() - HOUR),
      accessValidTo: new Date(now.getTime() + 48 * HOUR),
    };

    it('permite reportar durante la estadía', () => {
      expect(incidentEligibility(base, now)).toBe('ok');
    });

    it('permite reportar justo en el instante del check-in', () => {
      expect(incidentEligibility({ ...base, checkInAt: now }, now)).toBe('ok');
    });

    it('no permite reportar antes del check-in', () => {
      expect(
        incidentEligibility(
          { ...base, checkInAt: new Date(now.getTime() + 1) },
          now,
        ),
      ).toBe('antes-del-checkin');
    });

    it('distingue estancia cancelada, finalizada y sin edificio', () => {
      expect(
        incidentEligibility({ ...base, stayStatus: 'cancelled' }, now),
      ).toBe('cancelada');
      expect(
        incidentEligibility(
          { ...base, accessValidTo: new Date(now.getTime() - 1) },
          now,
        ),
      ).toBe('finalizada');
      expect(incidentEligibility({ ...base, buildingId: null }, now)).toBe(
        'sin-edificio',
      );
    });
  });
});
