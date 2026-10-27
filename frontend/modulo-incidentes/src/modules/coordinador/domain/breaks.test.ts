import { describe, expect, it } from "vitest";
import { breaksCrossed, breakWarning } from "./breaks";
import { isoAt } from "./dates";

const at = (hhmm: string) => isoAt("2026-10-28", hhmm);

describe("breaksCrossed", () => {
  it("detecta el almuerzo cuando la limpieza lo pisa", () => {
    expect(breaksCrossed(at("12:30"), at("13:15")).map((b) => b.label)).toEqual([
      "Almuerzo",
    ]);
  });

  it("detecta las dos pausas en una limpieza larga", () => {
    expect(breaksCrossed(at("09:30"), at("14:00")).map((b) => b.label)).toEqual([
      "Lunch",
      "Almuerzo",
    ]);
  });

  it("terminar justo al empezar la pausa, o empezar justo al acabar, no la cruza", () => {
    expect(breaksCrossed(at("12:00"), at("13:00"))).toEqual([]);
    expect(breaksCrossed(at("10:15"), at("11:00"))).toEqual([]);
  });

  it("acepta las horas en UTC que devuelve openMAINT", () => {
    // 15:00Z = 10:00 en Guayaquil
    expect(
      breaksCrossed("2026-10-28T15:05:00Z", "2026-10-28T15:30:00Z").map(
        (b) => b.label,
      ),
    ).toEqual(["Lunch"]);
  });

  it("sin horario completo no avisa", () => {
    expect(breaksCrossed(null, at("11:00"))).toEqual([]);
    expect(breaksCrossed(at("10:00"), null)).toEqual([]);
  });
});

describe("breakWarning", () => {
  it("nombra las pausas con su horario", () => {
    expect(breakWarning(breaksCrossed(at("09:30"), at("14:00")))).toBe(
      "El horario cruza el lunch (10:00–10:15) y el almuerzo (13:00–13:45).",
    );
  });

  it("sin pausas, nada", () => {
    expect(breakWarning([])).toBeNull();
  });
});
