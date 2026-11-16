import { describe, expect, it } from "vitest";
import { taskTimes } from "@/modules/supervisor/utils/taskTimes";

const planned = "2026-11-10T13:00:00Z";

describe("taskTimes · retraso", () => {
  it("sin horario planificado no afirma que no hubo retraso", () => {
    expect(taskTimes({ actualStartTime: planned }).delay).toBe("Sin planificar");
  });

  it("sin inicio real no hay retraso que medir", () => {
    expect(taskTimes({ plannedStartTime: planned }).delay).toBe("—");
  });

  it("iniciar a la hora o antes es «Sin retraso»", () => {
    expect(
      taskTimes({ plannedStartTime: planned, actualStartTime: planned }).delay,
    ).toBe("Sin retraso");
    expect(
      taskTimes({
        plannedStartTime: planned,
        actualStartTime: "2026-11-10T12:50:00Z",
      }).delay,
    ).toBe("Sin retraso");
  });

  it("iniciar tarde cuenta el retraso", () => {
    expect(
      taskTimes({
        plannedStartTime: planned,
        actualStartTime: "2026-11-10T14:05:00Z",
      }).delay,
    ).toBe("1h 5min");
  });
});

describe("taskTimes · duración", () => {
  it("manda el tiempo trabajado, no la resta de fechas", () => {
    expect(
      taskTimes({
        executionTime: 85,
        actualStartTime: "2026-11-10T13:00:00Z",
        actualEndTime: "2026-11-10T20:00:00Z",
      }).duration,
    ).toBe("1h 25min");
  });

  it("sin tiempo trabajado, respalda con fin − inicio", () => {
    expect(
      taskTimes({
        actualStartTime: "2026-11-10T13:00:00Z",
        actualEndTime: "2026-11-10T13:45:00Z",
      }).duration,
    ).toBe("45min");
  });

  it("pasa de un día: «1d 2h»", () => {
    expect(taskTimes({ executionTime: 1560 }).duration).toBe("1d 2h");
  });

  it("sin datos, «—»", () => {
    expect(taskTimes({}).duration).toBe("—");
  });
});

describe("taskTimes · fechas inconsistentes", () => {
  it("avisa si el fin es anterior al inicio", () => {
    expect(
      taskTimes({
        actualStartTime: "2026-11-10T15:00:00Z",
        actualEndTime: "2026-11-10T14:00:00Z",
      }).endsBeforeStart,
    ).toBe(true);
  });

  it("no avisa con el orden correcto ni con datos incompletos", () => {
    expect(
      taskTimes({
        actualStartTime: "2026-11-10T14:00:00Z",
        actualEndTime: "2026-11-10T15:00:00Z",
      }).endsBeforeStart,
    ).toBe(false);
    expect(taskTimes({ actualEndTime: "2026-11-10T15:00:00Z" }).endsBeforeStart).toBe(
      false,
    );
  });
});
