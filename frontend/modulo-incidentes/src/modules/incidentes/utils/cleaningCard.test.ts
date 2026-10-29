import { describe, expect, it } from "vitest";
import {
  cleaningFields,
  cleaningNoticeText,
  getCleaningLateness,
  isCleaningReopened,
  type CleaningCardTask,
} from "@/modules/incidentes/utils/cleaningCard";

const task = (extra: Partial<CleaningCardTask> = {}): CleaningCardTask => ({
  phase: "Assigned",
  description: "Limpieza de salida",
  unit: { id: 1, code: "S-906", description: "Torre Quito · Suite 906", name: "S-906" },
  plannedStartTime: "2026-10-08T10:00:00",
  plannedEndTime: "2026-10-08T12:00:00",
  actualStartTime: null,
  actualEndTime: null,
  executionTime: null,
  isPaused: false,
  ...extra,
});

const at = (hour: number, minute = 0) =>
  new Date(2026, 9, 8, hour, minute).getTime();

const labels = (fields: ReturnType<typeof cleaningFields>) =>
  fields.map((field) => field.label);

describe("getCleaningLateness", () => {
  it("avisa cuando ya debió empezar y no lo hizo", () => {
    expect(getCleaningLateness(task(), at(11))).toEqual({
      kind: "pending",
      ms: 60 * 60_000,
    });
    expect(getCleaningLateness(task(), at(9))).toBeNull();
  });

  it("distingue la tarea que empezó tarde de la que empezó a tiempo", () => {
    const late = task({ phase: "InExecution", actualStartTime: "2026-10-08T10:15:00" });
    expect(getCleaningLateness(late, at(11))).toEqual({ kind: "started", ms: 15 * 60_000 });

    const onTime = task({ phase: "InExecution", actualStartTime: "2026-10-08T10:00:00" });
    expect(getCleaningLateness(onTime, at(11))).toBeNull();
  });

  it("no marca atraso en pausa, reabierta ni fuera de las fases activas", () => {
    expect(getCleaningLateness(task({ isPaused: true }), at(11))).toBeNull();
    const reopened = task({ actualStartTime: "2026-10-08T10:05:00" });
    expect(getCleaningLateness(reopened, at(11))).toBeNull();
    expect(getCleaningLateness(task({ phase: "Completed" }), at(11))).toBeNull();
  });
});

describe("isCleaningReopened", () => {
  it("reconoce la tarea asignada con inicio previo y la ejecución con tiempo acumulado", () => {
    expect(isCleaningReopened(task({ actualStartTime: "2026-10-08T10:05:00" }))).toBe(true);
    expect(isCleaningReopened(task({ phase: "InExecution", executionTime: 30 }))).toBe(true);
    expect(isCleaningReopened(task())).toBe(false);
  });

  it("la pausa manda sobre la reapertura", () => {
    const paused = task({ isPaused: true, actualStartTime: "2026-10-08T10:05:00" });
    expect(isCleaningReopened(paused)).toBe(false);
  });
});

describe("cleaningNoticeText", () => {
  it("habla en segunda persona al operario y en tercera al supervisor", () => {
    const pending = { kind: "pending", ms: 60 * 60_000 } as const;
    const started = { kind: "started", ms: 15 * 60_000 } as const;
    expect(cleaningNoticeText(pending, "operator")).toBe("Atrasada · Llevas 1 h de retraso");
    expect(cleaningNoticeText(pending, "supervisor")).toBe("Atrasada · Debió iniciar hace 1 h");
    expect(cleaningNoticeText(started, "operator")).toBe("Atrasada · Empezaste con 15 min de retraso");
    expect(cleaningNoticeText(started, "supervisor")).toBe("Atrasada · Empezó con 15 min de retraso");
  });
});

describe("cleaningFields", () => {
  it("asignada: el operario ve el horario y la duración estimada", () => {
    const fields = cleaningFields(task(), "operator");
    expect(labels(fields)).toEqual(["Ubicación", "Inicio planeado", "Fin planeado", "Duración"]);
    expect(fields[0].value).toBe("Torre Quito · Suite 906");
    expect(fields[3].value).toBe("2 h estimada");
  });

  it("asignada: el supervisor suma al responsable y omite la duración", () => {
    const withEmployee = { ...task(), employee: { id: 7, name: "maria.perez" } };
    const fields = cleaningFields(withEmployee, "supervisor");
    expect(labels(fields)).toEqual(["Ubicación", "Responsable", "Inicio planeado", "Fin planeado"]);
    expect(fields[1].value).toBe("Maria Perez");
  });

  it("en pausa: muestra el tiempo trabajado", () => {
    const paused = task({
      isPaused: true,
      actualStartTime: "2026-10-08T09:00:00",
      executionTime: 80,
    });
    const fields = cleaningFields(paused, "operator");
    expect(labels(fields)).toEqual(["Ubicación", "Inicio real", "Trabajado"]);
    expect(fields[2].value).toBe("1 h 20 min");
  });

  it("en ejecución: inicio real y fin planeado", () => {
    const running = task({ phase: "InExecution", actualStartTime: "2026-10-08T09:05:00" });
    expect(labels(cleaningFields(running, "operator"))).toEqual([
      "Ubicación",
      "Inicio real",
      "Fin planeado",
    ]);
  });

  it("completada: la duración sale del tiempo acumulado o, sin él, de las fechas", () => {
    const done = task({
      phase: "Completed",
      actualStartTime: "2026-10-08T08:10:00",
      actualEndTime: "2026-10-08T09:50:00",
    });
    const byDates = cleaningFields(done, "operator");
    expect(labels(byDates)).toEqual(["Ubicación", "Inicio real", "Fin", "Duración"]);
    expect(byDates[3].value).toBe("1 h 40 min");

    const byWorked = cleaningFields({ ...done, executionTime: 95 }, "operator");
    expect(byWorked[3].value).toBe("1 h 35 min");
  });

  it("cancelada: solo el inicio planeado", () => {
    expect(labels(cleaningFields(task({ phase: "Cancelled" }), "supervisor"))).toEqual([
      "Ubicación",
      "Responsable",
      "Inicio planeado",
    ]);
  });
});
