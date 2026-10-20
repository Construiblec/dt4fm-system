import { describe, expect, it } from "vitest";
import { plannedStartProblem } from "./plannedStart";

const now = new Date(2026, 9, 20, 11, 30);

describe("plannedStartProblem", () => {
  it("pide fecha y hora", () => {
    expect(plannedStartProblem("", "", now)).toMatch(/fecha y la hora/);
    expect(plannedStartProblem("2026-10-21", "", now)).toMatch(/hora/);
  });

  it("rechaza una fecha anterior a hoy", () => {
    expect(plannedStartProblem("2026-10-19", "09:00", now)).toBe(
      "La fecha no puede ser anterior a hoy.",
    );
  });

  it("hoy solo admite una hora futura", () => {
    expect(plannedStartProblem("2026-10-20", "11:00", now)).toMatch(/ya pasó/);
    expect(plannedStartProblem("2026-10-20", "11:30", now)).toBeNull();
    expect(plannedStartProblem("2026-10-20", "15:00", now)).toBeNull();
  });

  it("acepta cualquier hora de un día futuro", () => {
    expect(plannedStartProblem("2026-10-21", "06:00", now)).toBeNull();
  });
});
