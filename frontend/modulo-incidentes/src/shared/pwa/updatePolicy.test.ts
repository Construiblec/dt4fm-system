import { describe, expect, it } from "vitest";
import { isSafeToUpdate } from "@/shared/pwa/updatePolicy";

const at = (pathname: string, search = "") => ({ pathname, search });

describe("isSafeToUpdate", () => {
  it("permite las pantallas de inicio y de lista", () => {
    for (const path of [
      "/",
      "/login",
      "/dashboard",
      "/supervisor",
      "/asistente-sl",
      "/supervisor-mantenimiento",
      "/notificaciones",
      "/cuenta",
      "/mis-reportes",
      "/coordinador",
      "/coordinador/pendientes",
    ]) {
      expect(isSafeToUpdate(at(path))).toBe(true);
    }
  });

  it("ignora la query de las listas y la barra final", () => {
    expect(isSafeToUpdate(at("/dashboard", "?tab=cleaning"))).toBe(true);
    expect(isSafeToUpdate(at("/supervisor/"))).toBe(true);
  });

  it("no recarga en pantallas con fotos o formularios", () => {
    for (const path of [
      "/cleaning-tasks/7913800/execute",
      "/reportar-incidente",
      "/report-incident",
      "/incidents/12",
      "/preventive-maintenance/5",
      "/supervisor/tasks/9",
      "/asistente-sl/tasks/9",
      "/coordinador/nueva",
      "/coordinador/checklists/nuevo",
      "/coordinador/checklists/9002",
      "/coordinador/sincronizacion",
    ]) {
      expect(isSafeToUpdate(at(path))).toBe(false);
    }
  });

  it("en la coordinación, no recarga con la ficha de una limpieza abierta", () => {
    expect(
      isSafeToUpdate(at("/coordinador/pendientes", "?limpieza=10124626")),
    ).toBe(false);
    expect(
      isSafeToUpdate(at("/coordinador/limpiezas", "?limpieza=1&modo=editar")),
    ).toBe(false);
  });

  it("trata como insegura una pantalla que no está en la lista", () => {
    expect(isSafeToUpdate(at("/pantalla-nueva"))).toBe(false);
  });
});
