import { describe, expect, it } from "vitest";
import {
  formatDayMonthYear,
  formatDayMonthYearTime,
  formatElapsed,
  formatLate,
  formatMinutes,
} from "./dateUtils";

const at = (hhmm: string, day = 12) => `2026-10-${day}T${hhmm}:00`;

describe("formatElapsed", () => {
  it("usa horas y minutos con espacio", () => {
    expect(formatElapsed(at("10:15"), at("12:40"))).toBe("2 h 25 min");
  });

  it("omite las horas cuando no llega a una", () => {
    expect(formatElapsed(at("09:00"), at("09:50"))).toBe("50 min");
  });

  it("omite los minutos en horas exactas y suma días", () => {
    expect(formatElapsed(at("09:00", 10), at("12:00", 11))).toBe("1 d 3 h");
  });

  it("devuelve null sin fin o con el fin antes del inicio", () => {
    expect(formatElapsed(at("09:00"), null)).toBeNull();
    expect(formatElapsed(at("10:00"), at("09:00"))).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("expresa minutos enteros en días, horas y minutos", () => {
    expect(formatMinutes(80)).toBe("1 h 20 min");
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(1620)).toBe("1 d 3 h");
  });
});

describe("formatLate", () => {
  it("usa unidades gruesas y nunca baja de un minuto", () => {
    expect(formatLate(10_000)).toBe("1 min");
    expect(formatLate(35 * 60_000)).toBe("35 min");
    expect(formatLate(18 * 3_600_000)).toBe("18 h");
    expect(formatLate((2 * 24 + 4) * 3_600_000)).toBe("2 d 4 h");
    expect(formatLate(24 * 3_600_000)).toBe("1 d");
  });
});

describe("formatDayMonthYearTime", () => {
  it("usa «7 oct 2026» sin depender del navegador", () => {
    expect(formatDayMonthYearTime("2026-10-07T14:05:00")).toBe("7 oct 2026, 2:05\u00a0p.\u00a0m.");
    expect(formatDayMonthYearTime("2026-10-07T00:30:00")).toBe("7 oct 2026, 12:30\u00a0a.\u00a0m.");
    expect(formatDayMonthYear("2026-01-15T09:00:00")).toBe("15 ene 2026");
    // Una fecha sin hora es día civil, no medianoche UTC.
    expect(formatDayMonthYear("2026-10-14")).toBe("14 oct 2026");
  });

  it("devuelve el texto de respaldo sin fecha válida", () => {
    expect(formatDayMonthYearTime(null, "Sin fecha")).toBe("Sin fecha");
    expect(formatDayMonthYearTime("x", "—")).toBe("—");
  });
});
