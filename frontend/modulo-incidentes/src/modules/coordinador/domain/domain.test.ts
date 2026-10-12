import { describe, expect, it } from "vitest";
import type { CoordTask } from "../types/Coordinador";
import {
  addDays,
  diffDays,
  formatDayShort,
  formatDuration,
  formatLongDate,
  formatRange,
  hmOf,
  isoAt,
  relativeDay,
  todayYmd,
  ymdOf,
} from "./dates";
import {
  canEdit,
  conflictsFor,
  findOverlaps,
  isOverdue,
  isPending,
  isReopened,
  overdueMinutes,
  parseTeamLog,
  statusKey,
  taskDate,
} from "./tasks";
import {
  describeChecklistMinutes,
  detalleToRows,
  lintChecklist,
  summarizeChecklist,
} from "./checklist";
import { describeCsvError, readCsvTemplate } from "./csvTemplate";

const task = (patch: Partial<CoordTask> = {}): CoordTask => ({
  id: 1,
  type: "CleaningTask",
  taskNumber: "CT.2026.0001",
  description: "Limpieza - Apto 101",
  phase: "Assigned",
  generatedDate: "2026-10-07",
  plannedStartTime: isoAt("2026-10-08", "11:00"),
  plannedEndTime: isoAt("2026-10-08", "12:30"),
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
  checkoutDate: null,
  source: "Manual",
  unit: null,
  employee: { id: 7001, name: "maria.lopez" },
  checklist: null,
  ...patch,
});

describe("fechas de Guayaquil", () => {
  it("hoy es el día de Guayaquil, no el de UTC", () => {
    // 2026-10-09 01:30 UTC = 2026-10-08 20:30 en Guayaquil.
    expect(todayYmd(Date.parse("2026-10-09T01:30:00Z"))).toBe("2026-10-08");
  });

  it("isoAt, ymdOf y hmOf son inversos entre sí", () => {
    const iso = isoAt("2026-10-08", "10:30");

    expect(iso).toBe("2026-10-08T10:30:00-05:00");
    expect(ymdOf(iso)).toBe("2026-10-08");
    expect(hmOf(iso)).toBe("10:30");
  });

  it("lee la hora de Guayaquil aunque el instante venga en UTC", () => {
    expect(hmOf("2026-10-08T15:30:00Z")).toBe("10:30");
    expect(ymdOf("2026-10-09T03:00:00Z")).toBe("2026-10-08");
  });

  it("suma días y los cuenta", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(diffDays("2026-10-08", "2026-10-15")).toBe(7);
  });

  it("formatea en español", () => {
    expect(formatLongDate("2026-10-08")).toBe("jueves 8 de octubre de 2026");
    expect(formatDayShort("2026-10-08")).toBe("jue 08/10");
    expect(relativeDay("2026-10-08", "2026-10-08")).toBe("hoy");
    expect(relativeDay("2026-10-09", "2026-10-08")).toBe("mañana");
    expect(relativeDay("2026-10-07", "2026-10-08")).toBe("ayer");
    expect(relativeDay("2026-10-12", "2026-10-08")).toBe("lun 12/10");
  });

  it("formatea rangos y duraciones", () => {
    expect(
      formatRange(isoAt("2026-10-08", "11:00"), isoAt("2026-10-08", "12:30")),
    ).toBe("11:00–12:30");
    expect(formatRange(null, null)).toBe("Sin horario");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(75)).toBe("1 h 15 min");
  });
});

describe("reglas de la limpieza", () => {
  it("una asignada sin empleado es pendiente; sin horario también; con ambos, no", () => {
    expect(isPending(task({ employee: null }))).toBe(true);
    expect(
      isPending(task({ plannedStartTime: null, plannedEndTime: null })),
    ).toBe(true);
    expect(isPending(task())).toBe(false);
  });

  it("la unidad no cuenta para ser pendiente", () => {
    expect(isPending(task({ unit: null }))).toBe(false);
  });

  it("una pausada o ya iniciada nunca es pendiente", () => {
    expect(isPending(task({ employee: null, isPaused: true }))).toBe(false);
    expect(
      isPending(
        task({ employee: null, actualStartTime: "2026-10-08T14:00:00Z" }),
      ),
    ).toBe(false);
  });

  it("estado visible: por asignar, asignada, en pausa, en ejecución, completada, revisada, cancelada", () => {
    expect(statusKey(task({ employee: null }))).toBe("pending");
    expect(statusKey(task())).toBe("assigned");
    expect(
      statusKey(
        task({ isPaused: true, actualStartTime: "2026-10-08T14:00:00Z" }),
      ),
    ).toBe("paused");
    expect(statusKey(task({ phase: "InExecution" }))).toBe("inProgress");
    expect(statusKey(task({ phase: "Completed" }))).toBe("review");
    expect(statusKey(task({ phase: "Reviewed" }))).toBe("done");
    expect(statusKey(task({ phase: "Cancelled" }))).toBe("cancelled");
  });

  it("reabierta: vuelve a Assigned con historial, o está en ejecución con tiempo acumulado", () => {
    expect(isReopened(task({ actualStartTime: "2026-10-07T14:00:00Z" }))).toBe(
      true,
    );
    expect(isReopened(task({ phase: "InExecution", executionTime: 30 }))).toBe(
      true,
    );
    expect(isReopened(task({ phase: "InExecution", executionTime: 0 }))).toBe(
      false,
    );
    // Una pausa también vuelve a Assigned con historial, pero la pausa manda.
    expect(
      isReopened(
        task({ isPaused: true, actualStartTime: "2026-10-08T14:00:00Z" }),
      ),
    ).toBe(false);
  });

  it("atrasada: asignada, con empleado y horario, y la hora de inicio ya pasó", () => {
    const now = Date.parse(isoAt("2026-10-08", "11:30"));

    expect(isOverdue(task(), now)).toBe(true);
    expect(overdueMinutes(task(), now)).toBe(30);
    expect(isOverdue(task(), Date.parse(isoAt("2026-10-08", "10:00")))).toBe(
      false,
    );
    expect(isOverdue(task({ employee: null }), now)).toBe(false);
    expect(isOverdue(task({ isPaused: true }), now)).toBe(false);
    expect(overdueMinutes(task({ phase: "InExecution" }), now)).toBe(0);
  });

  it("el coordinador edita solo lo que no empezó, igual que el backend", () => {
    expect(canEdit(task())).toBe(true);
    expect(canEdit(task({ employee: null }))).toBe(true);
    expect(canEdit(task({ isPaused: true }))).toBe(false);
    expect(canEdit(task({ actualStartTime: "2026-10-07T14:00:00Z" }))).toBe(
      false,
    );
    expect(canEdit(task({ phase: "InExecution" }))).toBe(false);
    expect(canEdit(task({ phase: "Completed" }))).toBe(false);
    expect(canEdit(task({ phase: "Cancelled" }))).toBe(false);
  });

  it("fecha de referencia: checkout, si no el día planificado, si no cuándo se creó", () => {
    expect(taskDate(task({ checkoutDate: "2026-10-09" }))).toBe("2026-10-09");
    expect(taskDate(task())).toBe("2026-10-08");
    expect(taskDate(task({ plannedStartTime: null }))).toBe("2026-10-07");
  });
});

describe("superposiciones", () => {
  const at = (id: number, employeeId: number, from: string, to: string) =>
    task({
      id,
      employee: { id: employeeId, name: `e${employeeId}` },
      plannedStartTime: isoAt("2026-10-08", from),
      plannedEndTime: isoAt("2026-10-08", to),
    });

  it("avisa de lo que se cruza con el mismo empleado y deja pasar lo contiguo", () => {
    const tasks = [
      at(1, 7001, "11:30", "13:00"),
      at(2, 7001, "12:30", "14:00"),
    ];

    const conflicts = conflictsFor(
      7001,
      isoAt("2026-10-08", "12:00"),
      isoAt("2026-10-08", "13:30"),
      tasks,
    );
    expect(conflicts.map((t) => t.id)).toEqual([1, 2]);

    expect(
      conflictsFor(
        7001,
        isoAt("2026-10-08", "13:00"),
        isoAt("2026-10-08", "13:30"),
        [at(1, 7001, "11:30", "13:00")],
      ),
    ).toEqual([]);
  });

  it("ignora a otros empleados, las canceladas y la propia limpieza", () => {
    const tasks = [
      at(1, 7002, "11:30", "13:00"),
      { ...at(2, 7001, "11:30", "13:00"), phase: "Cancelled" },
      at(3, 7001, "11:30", "13:00"),
    ];

    expect(
      conflictsFor(
        7001,
        isoAt("2026-10-08", "12:00"),
        isoAt("2026-10-08", "13:00"),
        tasks,
        [3],
      ),
    ).toEqual([]);
  });

  it("findOverlaps marca ambas partes del cruce", () => {
    const map = findOverlaps([
      at(1, 7001, "11:30", "13:00"),
      at(2, 7001, "12:30", "14:00"),
      at(3, 7002, "12:30", "14:00"),
    ]);

    expect([...map.keys()].sort()).toEqual([1, 2]);
    expect(map.get(1)?.map((t) => t.id)).toEqual([2]);
  });
});

describe("bitácora del equipo", () => {
  it("lee la pausa con su motivo, la reanudación y el reinicio con los minutos previos", () => {
    const entries = parseTeamLog(
      "[Pausado: 2026-10-08 | 10:20]: Se acabó el detergente\n[Reanudado: 2026-10-08 | 10:34]\n[Reiniciado: 2026-10-08 | 11:00 | 25min]",
    );

    expect(entries).toEqual([
      {
        type: "pause",
        date: "2026-10-08",
        time: "10:20",
        carryMinutes: null,
        text: "Se acabó el detergente",
      },
      {
        type: "resume",
        date: "2026-10-08",
        time: "10:34",
        carryMinutes: null,
        text: "",
      },
      {
        type: "restart",
        date: "2026-10-08",
        time: "11:00",
        carryMinutes: 25,
        text: "",
      },
    ]);
  });

  it("deja el texto suelto como nota y tolera vacío", () => {
    expect(parseTeamLog("Llegué tarde por el ascensor")).toEqual([
      { type: "note", text: "Llegué tarde por el ascensor" },
    ]);
    expect(parseTeamLog(null)).toEqual([]);
  });
});

describe("checklist", () => {
  it("resume secciones, actividades y minutos", () => {
    const summary = summarizeChecklist([
      "Baño;Lavar el inodoro;5",
      "Baño;Limpiar el espejo;3",
      "Cocina;Limpiar el mesón;7",
    ]);

    expect(summary.sectionCount).toBe(2);
    expect(summary.activityCount).toBe(3);
    expect(summary.minutes).toBe(15);
    expect(describeChecklistMinutes(summary)).toBe("15 min");
  });

  it("marca como aproximado un total al que le faltan minutos", () => {
    const summary = summarizeChecklist(["Baño;Lavar;5", "Baño;Secar;"]);

    expect(describeChecklistMinutes(summary)).toBe("~5 min");
  });

  it("sin minutos o sin actividades lo dice", () => {
    expect(describeChecklistMinutes(summarizeChecklist(["Baño,Lavar"]))).toBe(
      "Sin minutos",
    );
    expect(describeChecklistMinutes(summarizeChecklist([]))).toBe(
      "Sin actividades",
    );
  });

  it("el Detalle sin archivo se parte por líneas y descarta las vacías", () => {
    expect(detalleToRows(" a,b \n\n c,d\n")).toEqual(["a,b", "c,d"]);
    expect(detalleToRows(null)).toEqual([]);
  });

  it("la revisión avisa del encabezado, la sección repetida y los minutos que faltan", () => {
    const { warnings } = lintChecklist([
      "Seccion;Actividades;tiempo",
      "Baño;Lavar;5",
      "Cocina;Limpiar;7",
      "Baño;Secar;",
    ]);
    const texts = warnings.map((w) => w.text).join("\n");

    expect(texts).toMatch(/encabezado/);
    expect(texts).toMatch(/sección «Baño» vuelve a aparecer/);
    expect(texts).toMatch(/1 actividad no tiene minutos/);
  });

  it("avisa cuando el archivo viene separado por tabulaciones", () => {
    const { warnings } = lintChecklist(["Baño\tLavar\t5"]);

    expect(
      warnings.some((w) => w.level === "error" && /tabulaciones/.test(w.text)),
    ).toBe(true);
  });
});

describe("lector de la plantilla CSV", () => {
  const utf16 = (text: string) => {
    const out = new Uint8Array(2 + text.length * 2);
    out.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i += 1) {
      out[2 + i * 2] = text.charCodeAt(i) & 0xff;
      out[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    return out;
  };
  const latin1 = (text: string) =>
    Uint8Array.from(
      [...text].map((c) => (c.charCodeAt(0) <= 0xff ? c.charCodeAt(0) : 63)),
    );

  it("lee UTF-8 con BOM", () => {
    const body = new TextEncoder().encode(
      "Titulo;Actividad;Minutos\r\nBaño;Lavar;5\r\n",
    );
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);

    expect(readCsvTemplate(bytes)).toEqual({
      ok: true,
      rows: ["Titulo;Actividad;Minutos", "Baño;Lavar;5"],
      encoding: "utf-8",
    });
  });

  it("lee el CSV de Excel en español (Windows-1252) sin romper la ñ", () => {
    const result = readCsvTemplate(latin1("Baño;Lavar el inodoro;5\r\n"));

    expect(result).toMatchObject({ ok: true, encoding: "windows-1252" });
    expect(result.ok && result.rows).toEqual(["Baño;Lavar el inodoro;5"]);
  });

  it("lee UTF-16 («Texto Unicode») y lo declara", () => {
    const result = readCsvTemplate(utf16("Baño\tLavar\t5\r\n"));

    expect(result).toMatchObject({ ok: true, encoding: "utf-16" });
  });

  it("un salto de línea dentro de comillas no corta la fila", () => {
    const result = readCsvTemplate(
      new TextEncoder().encode('Baño;"Lavar\nparedes";5\nCocina;Barrer;3\n'),
    );

    expect(result.ok && result.rows).toEqual([
      'Baño;"Lavar paredes";5',
      "Cocina;Barrer;3",
    ]);
  });

  it("rechaza vacío, pesado, Excel y PDF con el mensaje de la interfaz", () => {
    const empty = readCsvTemplate(new Uint8Array());
    expect(!empty.ok && describeCsvError(empty)).toBe("El archivo está vacío.");

    const xlsx = readCsvTemplate(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]));
    expect(!xlsx.ok && describeCsvError(xlsx)).toMatch(
      /Excel \(\.xlsx u \.ods\)/,
    );

    const pdf = readCsvTemplate(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0]));
    expect(!pdf.ok && describeCsvError(pdf)).toBe(
      "El archivo es un PDF, no un CSV.",
    );

    const big = readCsvTemplate(new Uint8Array(1024 * 1024 + 1).fill(65));
    expect(!big.ok && describeCsvError(big)).toBe(
      "El archivo pesa más de 1 MB.",
    );

    const blank = readCsvTemplate(new TextEncoder().encode("\n \r\n"));
    expect(!blank.ok && describeCsvError(blank)).toBe(
      "El archivo no tiene ninguna fila con contenido.",
    );
  });
});
