import { describe, expect, it } from "vitest";
import {
  preventiveFields,
  preventiveNoticeText,
} from "@/modules/incidentes/utils/preventiveCard";
import type { MaintenanceCardData } from "@/shared/components/MaintenanceCard";

const data = (extra: Partial<MaintenanceCardData> = {}): MaintenanceCardData => ({
  id: 1,
  number: "MP-5201",
  subject: "Mantenimiento trimestral de ascensor",
  statusCode: "Acceptance",
  status: "Asignación",
  site: "Torre Quito",
  target: "Ascensor 1",
  assignee: "Carlos Mena",
  priorityCode: null,
  plannedStart: "2026-10-09T09:00:00",
  dueDate: "2026-10-10T18:00:00",
  execStartDate: null,
  execEndDate: null,
  suspensionReason: null,
  isOverdue: false,
  ...extra,
});

const labels = (fields: ReturnType<typeof preventiveFields>) =>
  fields.map((field) => field.label);

describe("preventiveFields", () => {
  it("asignación: equipo, ubicación, inicio previsto y fecha límite", () => {
    expect(labels(preventiveFields(data(), "operator"))).toEqual([
      "Equipo",
      "Ubicación",
      "Inicio previsto",
      "Fecha límite",
    ]);
  });

  it("el supervisor ve al responsable y, sin equipo en el listado, no hay fila de equipo", () => {
    const fields = preventiveFields(data({ target: null, assignee: null }), "supervisor");
    expect(labels(fields)).toEqual([
      "Ubicación",
      "Responsable",
      "Inicio previsto",
      "Fecha límite",
    ]);
    expect(fields[1].value).toBe("Sin asignar");
  });

  it("omite las fechas sin valor", () => {
    const planning = data({ statusCode: "Planning", plannedStart: null });
    expect(labels(preventiveFields(planning, "supervisor"))).toEqual([
      "Equipo",
      "Ubicación",
      "Responsable",
      "Fecha límite",
    ]);
  });

  it("ejecución: inicio real y fecha límite", () => {
    const running = data({ statusCode: "Execution", execStartDate: "2026-10-08T08:10:00" });
    expect(labels(preventiveFields(running, "operator"))).toEqual([
      "Equipo",
      "Ubicación",
      "Inicio real",
      "Fecha límite",
    ]);
  });

  it("completado: inicio, fin y duración", () => {
    const done = data({
      statusCode: "Completed",
      execStartDate: "2026-10-07T15:05:00",
      execEndDate: "2026-10-07T17:30:00",
    });
    const fields = preventiveFields(done, "operator");
    expect(labels(fields).slice(2)).toEqual(["Inicio real", "Fin", "Duración"]);
    expect(fields[4].value).toBe("2 h 25 min");
  });

  it("suspensión: el motivo sustituye al inicio previsto", () => {
    const withReason = data({ statusCode: "Suspension", suspensionReason: "Falta repuesto" });
    const fields = preventiveFields(withReason, "operator");
    expect(labels(fields).slice(2)).toEqual(["Motivo", "Fecha límite"]);
    expect(fields[2].value).toBe("Falta repuesto");

    const noReason = data({ statusCode: "Suspension" });
    expect(labels(preventiveFields(noReason, "operator")).slice(2)).toEqual([
      "Inicio previsto",
      "Fecha límite",
    ]);
  });

  it("cancelado: solo el inicio previsto", () => {
    expect(labels(preventiveFields(data({ statusCode: "Canceled" }), "operator")).slice(2)).toEqual([
      "Inicio previsto",
    ]);
  });
});

describe("preventiveNoticeText", () => {
  const now = new Date(2026, 9, 11, 18, 0).getTime();

  it("no avisa si no está vencido", () => {
    expect(preventiveNoticeText(data(), now)).toBeNull();
  });

  it("dice hace cuánto venció", () => {
    expect(preventiveNoticeText(data({ isOverdue: true }), now)).toBe("Vencido · Venció hace 1 d");
  });

  it("sin fecha límite válida solo dice «Vencido»", () => {
    expect(preventiveNoticeText(data({ isOverdue: true, dueDate: null }), now)).toBe("Vencido");
  });
});
