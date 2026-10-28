import { describe, expect, it } from "vitest";
import {
  filterOperatorTasks,
  localDay,
  shiftDay,
  taskDay,
} from "@/modules/incidentes/utils/operatorCleaningFilter";

const TODAY = "2026-10-28";
const YESTERDAY = "2026-10-27";
const TOMORROW = "2026-10-29";

const task = (
  id: number,
  phase: string,
  day: string | null,
  extra: { isPaused?: boolean; checkoutDate?: string | null } = {},
) => ({
  id,
  phase,
  isPaused: extra.isPaused ?? false,
  // Mediodía local: el día no depende de la zona de la máquina de pruebas
  plannedStartTime: (day ? `${day}T12:00:00` : null) as string,
  checkoutDate: extra.checkoutDate ?? null,
  generatedDate: "2026-01-01",
});

const ids = (list: Array<{ id: number }>) => list.map((t) => t.id);

const tasks = [
  task(1, "Assigned", TODAY),
  task(2, "InExecution", TODAY),
  task(3, "Completed", TODAY),
  task(4, "Assigned", YESTERDAY, { isPaused: true }),
  task(5, "InExecution", YESTERDAY),
  task(6, "Assigned", TOMORROW),
  task(7, "Completed", YESTERDAY),
  task(8, "Reviewed", TODAY),
  task(9, "Assigned", YESTERDAY),
];

describe("filterOperatorTasks", () => {
  it("«Todas» en hoy: las de hoy sin completadas, más las en curso y en pausa de otro día", () => {
    expect(
      ids(filterOperatorTasks(tasks, { phase: "ALL", day: TODAY, today: TODAY })),
    ).toEqual([1, 2, 4, 5]);
  });

  it("las completadas solo salen con «Completada», y del día elegido", () => {
    expect(
      ids(filterOperatorTasks(tasks, { phase: "Completed", day: TODAY, today: TODAY })),
    ).toEqual([3]);
    expect(
      ids(
        filterOperatorTasks(tasks, { phase: "Completed", day: YESTERDAY, today: TODAY }),
      ),
    ).toEqual([7]);
  });

  it("otro día no arrastra las que están en curso", () => {
    expect(
      ids(filterOperatorTasks(tasks, { phase: "ALL", day: TOMORROW, today: TODAY })),
    ).toEqual([6]);
    expect(
      ids(filterOperatorTasks(tasks, { phase: "ALL", day: YESTERDAY, today: TODAY })),
    ).toEqual([4, 5, 9]);
  });

  it("«Asignada» incluye la pausada, como en openMAINT", () => {
    expect(
      ids(filterOperatorTasks(tasks, { phase: "Assigned", day: TODAY, today: TODAY })),
    ).toEqual([1, 4]);
  });

  it("nunca muestra revisadas", () => {
    expect(
      ids(filterOperatorTasks(tasks, { phase: "Reviewed", day: TODAY, today: TODAY })),
    ).toEqual([]);
  });
});

describe("taskDay", () => {
  it("sin horario cae en el checkout y, si no, en la creación", () => {
    expect(taskDay(task(1, "Assigned", null, { checkoutDate: YESTERDAY }))).toBe(
      YESTERDAY,
    );
    expect(taskDay(task(1, "Assigned", null))).toBe("2026-01-01");
  });
});

describe("localDay", () => {
  it("una fecha sin hora no se corre un día", () => {
    expect(localDay("2026-10-14")).toBe("2026-10-14");
  });

  it("un instante da su día local", () => {
    expect(localDay(new Date(2026, 9, 28, 23, 30))).toBe("2026-10-28");
  });

  it("una fecha inválida da null", () => {
    expect(localDay("no es fecha")).toBeNull();
  });
});

describe("shiftDay", () => {
  it("avanza y retrocede cruzando meses", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
  });
});
