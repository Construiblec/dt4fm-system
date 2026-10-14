import { describe, expect, it } from "vitest";
import { formatElapsed } from "./dateUtils";

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
