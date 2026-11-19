import { describe, expect, it } from "vitest";
import {
  defaultFilters,
  toParams,
} from "@/modules/supervisor/hooks/useSupervisorTasks";

const filters = (overrides: Partial<ReturnType<typeof defaultFilters>> = {}) => ({
  phase: "",
  date: "2026-11-16",
  employeeId: "",
  ...overrides,
});

describe("toParams (filtros del panel)", () => {
  it("el día va de medianoche a medianoche en hora de Ecuador", () => {
    expect(toParams(filters())).toEqual({
      endedFrom: "2026-11-16T00:00:00-05:00",
      endedTo: "2026-11-17T00:00:00-05:00",
    });
  });

  it("a fin de mes y de año el día siguiente cambia de mes y de año", () => {
    expect(toParams(filters({ date: "2026-11-30" })).endedTo).toBe(
      "2026-12-01T00:00:00-05:00",
    );
    expect(toParams(filters({ date: "2026-12-31" })).endedTo).toBe(
      "2027-01-01T00:00:00-05:00",
    );
  });

  it("sin fecha no manda rango: se ven todas", () => {
    expect(toParams(filters({ date: "" }))).toEqual({});
  });

  it("incluye la fase y el empleado cuando se eligen", () => {
    expect(
      toParams(filters({ date: "", phase: "Completed", employeeId: "42" })),
    ).toEqual({ phase: "Completed", employeeId: 42 });
  });
});

describe("defaultFilters (al abrir el panel)", () => {
  it("abre en el día de hoy de Ecuador, no en el de UTC", () => {
    // 2026-11-17 03:30 UTC son las 22:30 del 16 en Guayaquil.
    expect(defaultFilters(Date.parse("2026-11-17T03:30:00Z")).date).toBe(
      "2026-11-16",
    );
  });

  it("pasada la medianoche de Ecuador ya es el día siguiente", () => {
    // 05:30 UTC son las 00:30 del 17 en Guayaquil.
    expect(defaultFilters(Date.parse("2026-11-17T05:30:00Z")).date).toBe(
      "2026-11-17",
    );
  });

  it("empieza con todas las fases y sin empleado", () => {
    expect(defaultFilters()).toMatchObject({ phase: "", employeeId: "" });
  });
});
