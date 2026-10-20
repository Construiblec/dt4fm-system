import { describe, expect, it } from "vitest";
import { buildWorkDateRows } from "./workDates";

describe("buildWorkDateRows", () => {
  it("oculta las filas sin valor", () => {
    expect(buildWorkDateRows({})).toEqual([]);
    expect(
      buildWorkDateRows({ plannedStart: "2026-10-07T09:00:00-05:00" }).map(
        (row) => row.label,
      ),
    ).toEqual(["Inicio previsto"]);
  });

  it("añade la duración solo con inicio y fin reales", () => {
    const rows = buildWorkDateRows({
      plannedStart: "2026-10-07T09:00:00-05:00",
      execStartDate: "2026-10-07T09:10:00-05:00",
      execEndDate: "2026-10-07T11:30:00-05:00",
    });

    expect(rows.map((row) => row.label)).toEqual([
      "Inicio previsto",
      "Inicio real",
      "Fin",
      "Duración",
    ]);
    expect(rows[3].value).toBe("2 h 20 min");
  });
});
