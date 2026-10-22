import { describe, expect, it } from "vitest";
import { fitsRole } from "@/shared/constants/rolePalette";

describe("fitsRole", () => {
  it("restaura la pantalla del mismo rol", () => {
    expect(fitsRole("/coordinador/limpiezas?limpieza=1", "Coordinador")).toBe(
      true,
    );
    expect(fitsRole("/supervisor/tasks/9", "SupervisorLimpieza")).toBe(true);
    expect(fitsRole("/supervisor-cav/puertas", "SupervisorCAV")).toBe(true);
  });

  it("no lleva a la pantalla de otro rol", () => {
    expect(fitsRole("/coordinador/limpiezas", "SupervisorLimpieza")).toBe(
      false,
    );
    expect(fitsRole("/supervisor", "Coordinador")).toBe(false);
    expect(fitsRole("/dashboard", "SupervisorMantenimiento")).toBe(false);
  });

  it("no confunde /supervisor con /supervisor-mantenimiento", () => {
    expect(fitsRole("/supervisor-mantenimiento", "SupervisorLimpieza")).toBe(
      false,
    );
  });

  it("deja pasar las pantallas comunes a todos los roles", () => {
    expect(fitsRole("/notificaciones", "Coordinador")).toBe(true);
    expect(fitsRole("/cuenta", "SupervisorLimpieza")).toBe(true);
    expect(fitsRole("/cleaning-tasks/12/execute", "Team")).toBe(true);
  });
});
