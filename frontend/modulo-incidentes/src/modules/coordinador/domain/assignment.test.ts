import { describe, expect, it } from "vitest";
import type { CoordTask, EmployeeOption } from "../types/Coordinador";
import {
  draftFor,
  dragIds,
  formatShortDay,
  isDirty,
  planPayload,
  scheduleChip,
  tasksByEmployee,
  unassignedTasks,
  visibleEmployees,
} from "./assignment";

const task = (id: number, extra: Partial<CoordTask> = {}): CoordTask => ({
  id,
  type: "CleaningTask",
  taskNumber: `LMP-${id}`,
  description: "Limpieza - Suite",
  phase: "Assigned",
  generatedDate: "2026-10-20T10:00:00Z",
  plannedStartTime: null,
  plannedEndTime: null,
  actualStartTime: null,
  actualEndTime: null,
  executionTime: null,
  delayTime: null,
  taskObservations: null,
  supervisionObserv: null,
  teamObservations: null,
  isPaused: false,
  hostawayReservation: null,
  hostawayListingId: null,
  checkoutDate: "2026-10-26",
  source: "Manual",
  unit: null,
  employee: null,
  checklist: null,
  ...extra,
});

const emp = (id: number, name: string): EmployeeOption => ({ id, name, team: null });

describe("formatShortDay", () => {
  it("abrevia día de la semana, día y mes", () => {
    expect(formatShortDay("2026-10-26")).toBe("lun 26 oct");
  });
});

describe("unassignedTasks y tasksByEmployee", () => {
  const list = [
    task(2),
    task(1),
    task(3, { employee: { id: 7, name: "a.b" } }),
    task(4, { phase: "InExecution", actualStartTime: "2026-10-26T14:00:00Z" }),
  ];

  it("reparte solo lo editable y ordena por fecha y número", () => {
    expect(unassignedTasks(list).map((t) => t.id)).toEqual([1, 2]);
  });

  it("agrupa por operador y deja primero lo que ya tiene hora", () => {
    const withTime = task(5, {
      employee: { id: 7, name: "a.b" },
      plannedStartTime: "2026-10-26T13:00:00Z",
    });
    const map = tasksByEmployee([...list, withTime]);
    expect(map.get(7)?.map((t) => t.id)).toEqual([5, 3]);
    expect(map.has(4)).toBe(false);
  });
});

describe("visibleEmployees", () => {
  const all = [emp(1, "zoe.perez"), emp(2, "ana.lopez"), emp(3, "luis.andrade")];

  it("ordena por nombre y recorta al límite", () => {
    const { shown, total } = visibleEmployees(all, "", 2);
    expect(shown.map((e) => e.id)).toEqual([2, 3]);
    expect(total).toBe(3);
  });

  it("busca sin tildes ni mayúsculas y «all» no recorta", () => {
    expect(visibleEmployees(all, "LÓPEZ", "all").shown.map((e) => e.id)).toEqual([2]);
    expect(visibleEmployees(all, "", "all").shown).toHaveLength(3);
  });
});

describe("dragIds", () => {
  it("una limpieza marcada lleva todas las marcadas; una sin marcar va sola", () => {
    const selected = new Set([1, 2, 3]);
    expect(dragIds(2, selected).sort()).toEqual([1, 2, 3]);
    expect(dragIds(9, selected)).toEqual([9]);
  });
});

describe("planPayload", () => {
  const base = task(1, { employee: { id: 7, name: "a.b" } });
  const draft = { date: "2026-10-26", start: "08:00", end: "10:00", checklistId: null };

  it("arma las horas de Guayaquil", () => {
    expect(planPayload(draft, base)).toEqual({
      payload: {
        plannedStartTime: "2026-10-26T08:00:00-05:00",
        plannedEndTime: "2026-10-26T10:00:00-05:00",
      },
    });
  });

  it("exige inicio y fin, y que el fin sea posterior", () => {
    expect(planPayload({ ...draft, end: "" }, base)).toEqual({
      error: "Indica la hora de inicio y la de fin.",
    });
    expect(planPayload({ ...draft, end: "07:00" }, base)).toEqual({
      error: "La hora de fin debe ser posterior a la de inicio.",
    });
  });

  it("manda solo el checklist si es lo único que cambió", () => {
    expect(planPayload({ ...draft, start: "", end: "", checklistId: 4 }, base)).toEqual({
      payload: { cleaningChecklistId: 4 },
    });
  });

  it("sin cambios no hay nada que guardar", () => {
    expect(planPayload({ ...draft, start: "", end: "" }, base)).toEqual({
      error: "No hay cambios para guardar.",
    });
  });
});

describe("draftFor, isDirty y scheduleChip", () => {
  const planned = task(1, {
    plannedStartTime: "2026-10-26T13:00:00Z",
    plannedEndTime: "2026-10-26T15:00:00Z",
  });

  it("parte de lo planificado y lo muestra en la fila cerrada", () => {
    const draft = draftFor(planned, "2026-10-26");
    expect(draft).toMatchObject({ date: "2026-10-26", start: "08:00", end: "10:00" });
    expect(isDirty(draft, planned, "2026-10-26")).toBe(false);
    expect(isDirty({ ...draft, end: "11:00" }, planned, "2026-10-26")).toBe(true);
    expect(scheduleChip(planned)).toBe("lun 26 oct · 08:00");
    expect(scheduleChip(task(2))).toBeNull();
  });

  it("sin plan propone el día del checkout, o hoy si ya pasó", () => {
    expect(draftFor(task(2), "2026-10-20").date).toBe("2026-10-26");
    expect(draftFor(task(2), "2026-10-30").date).toBe("2026-10-30");
  });
});
