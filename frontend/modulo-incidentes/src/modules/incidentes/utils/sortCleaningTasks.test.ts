import { describe, expect, it } from "vitest";
import {
  sortTasksForOperator,
  sortTasksForSupervision,
} from "@/modules/incidentes/utils/sortCleaningTasks";

const task = (
  id: number,
  phase: string,
  start: string | null,
  extra: { isPaused?: boolean } = {},
) => ({
  id,
  phase,
  isPaused: extra.isPaused ?? false,
  plannedStartTime: start as string,
  actualStartTime: null,
  generatedDate: "2026-01-01T00:00:00-05:00",
});

const ids = (list: Array<{ id: number }>) => list.map((t) => t.id);

describe("sortTasksForOperator", () => {
  it("pone en ejecución y en pausa primero, y luego de la más reciente a la más antigua", () => {
    const sorted = sortTasksForOperator([
      task(1, "Assigned", "2026-10-10T09:00:00-05:00"),
      task(2, "Assigned", "2026-10-12T09:00:00-05:00"),
      task(3, "Assigned", "2026-10-01T09:00:00-05:00", { isPaused: true }),
      task(4, "InExecution", "2026-09-20T09:00:00-05:00"),
      task(5, "Completed", "2026-10-11T09:00:00-05:00"),
    ]);

    // Activas (4 y 3) por fecha descendente, luego el resto: 2, 5, 1.
    expect(ids(sorted)).toEqual([3, 4, 2, 5, 1]);
  });

  it("no modifica el arreglo original", () => {
    const original = [
      task(1, "Assigned", "2026-10-10T09:00:00-05:00"),
      task(2, "Assigned", "2026-10-12T09:00:00-05:00"),
    ];
    sortTasksForOperator(original);
    expect(ids(original)).toEqual([1, 2]);
  });

  it("usa el inicio real o la creación cuando falta el planificado", () => {
    const sorted = sortTasksForOperator([
      task(1, "Assigned", null),
      task(2, "Assigned", "2025-12-01T09:00:00-05:00"),
    ]);
    // La 1 cae en su fecha de creación (2026-01-01), más reciente que la 2.
    expect(ids(sorted)).toEqual([1, 2]);
  });
});

describe("sortTasksForSupervision", () => {
  it("pone lo por revisar primero y lo revisado al final, la más antigua arriba en cada sección", () => {
    const sorted = sortTasksForSupervision([
      task(1, "Reviewed", "2026-10-02T09:00:00-05:00"),
      task(2, "Completed", "2026-10-11T09:00:00-05:00"),
      task(3, "Reviewed", "2026-09-15T09:00:00-05:00"),
      task(4, "Completed", "2026-10-03T09:00:00-05:00"),
    ]);

    expect(ids(sorted)).toEqual([4, 2, 3, 1]);
  });

  it("desempata por id, la más nueva primero", () => {
    const same = "2026-10-05T09:00:00-05:00";
    const sorted = sortTasksForSupervision([
      task(1, "Completed", same),
      task(2, "Completed", same),
    ]);
    expect(ids(sorted)).toEqual([2, 1]);
  });
});
