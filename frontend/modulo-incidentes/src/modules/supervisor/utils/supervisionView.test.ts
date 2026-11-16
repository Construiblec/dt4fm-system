import { describe, expect, it } from "vitest";
import type {
  SupervisionArea,
  SupervisionFinding,
} from "@/modules/supervisor/types/Supervision";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import { isSupervisable } from "@/modules/supervisor/hooks/useSupervisorTasks";
import {
  countPhotos,
  findingTitle,
  findingsByArea,
  findingsOfPoint,
  groupFindingsByArea,
  initialsOf,
  pendingFindings,
  plural,
  pointLabel,
  resolvedFindings,
  teamNotes,
} from "@/modules/supervisor/utils/supervisionView";

const finding = (
  overrides: Partial<SupervisionFinding> = {},
): SupervisionFinding => ({
  id: 1,
  index: 1,
  point: { area: "Dormitorios", name: "Tendido de camas", criterion: "" },
  subcategory: { id: 21, name: "Sábanas manchadas", isOther: false },
  observation: null,
  resolvedBySupervisor: false,
  photos: [],
  fixPhotos: [],
  ...overrides,
});

const areas: SupervisionArea[] = [
  {
    name: "Dormitorios",
    guide: "",
    points: [
      { index: 1, area: "Dormitorios", areaGuide: "", name: "Camas", criterion: "" },
      { index: 2, area: "Dormitorios", areaGuide: "", name: "Polvo", criterion: "" },
    ],
  },
  {
    name: "Cocina",
    guide: "",
    points: [
      { index: 3, area: "Cocina", areaGuide: "", name: "Vajilla", criterion: "" },
    ],
  },
];

describe("supervisionView", () => {
  it("cuenta las novedades por área sin inventar conformes", () => {
    const findings = [
      finding({ id: 1, index: 1 }),
      finding({ id: 2, index: 2 }),
      finding({ id: 3, index: 2 }),
    ];

    expect(findingsByArea(areas, findings)).toEqual([
      { name: "Dormitorios", count: 3 },
      { name: "Cocina", count: 0 },
    ]);
  });

  it("filtra las novedades de un punto por su número de fila", () => {
    const findings = [finding({ id: 1, index: 1 }), finding({ id: 2, index: 3 })];

    expect(findingsOfPoint(findings, 3).map((f) => f.id)).toEqual([2]);
  });

  it("con «Otro», el título lleva la observación", () => {
    expect(
      findingTitle(
        finding({
          subcategory: { id: 29, name: "Otro", isOther: true },
          observation: "Telaraña en el techo",
        }),
      ),
    ).toBe("Otro · Telaraña en el techo");
    expect(findingTitle(finding())).toBe("Sábanas manchadas");
  });

  it("sin checklist legible, la novedad se rotula por su número de punto", () => {
    expect(pointLabel(finding({ point: null, index: 7 }))).toBe("Punto 7");
    expect(pointLabel(finding())).toBe("Dormitorios · Tendido de camas");
  });

  it("suma las fotos de todas las novedades", () => {
    const photo = { id: "a", fileName: null, uploadDate: null, downloadUrl: "/x" };
    expect(
      countPhotos([finding({ photos: [photo, photo] }), finding({ photos: [photo] })]),
    ).toBe(3);
  });

  it("arma iniciales y plurales", () => {
    expect(initialsOf("maria.lopez")).toBe("ML");
    expect(initialsOf("Rosa Quishpe Andrade")).toBe("RQ");
    expect(plural(1, "novedad", "novedades")).toBe("1 novedad");
    expect(plural(2, "novedad", "novedades")).toBe("2 novedades");
  });
});

describe("groupFindingsByArea (pantalla del operario)", () => {
  it("agrupa en el orden del checklist y omite las áreas sin novedades", () => {
    const findings = [
      finding({ id: 1, index: 3 }),
      finding({ id: 2, index: 1 }),
      finding({ id: 3, index: 2 }),
    ];

    expect(
      groupFindingsByArea(areas, findings).map((group) => ({
        name: group.name,
        ids: group.findings.map((f) => f.id),
      })),
    ).toEqual([
      { name: "Dormitorios", ids: [2, 3] },
      { name: "Cocina", ids: [1] },
    ]);
  });

  it("las que no caen en ningún punto conocido van al final", () => {
    const groups = groupFindingsByArea(areas, [
      finding({ id: 1, index: 99 }),
      finding({ id: 2, index: null }),
      finding({ id: 3, index: 3 }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["Cocina", "Otros puntos"]);
    expect(groups[1].findings.map((f) => f.id)).toEqual([1, 2]);
  });

  it("sin checklist legible, todas van a «Otros puntos»", () => {
    expect(groupFindingsByArea([], [finding({ id: 1 })])).toEqual([
      { name: "Otros puntos", findings: [finding({ id: 1 })] },
    ]);
  });
});

describe("teamNotes (observaciones del equipo)", () => {
  it("deja las notas y quita la bitácora de pausas", () => {
    expect(
      teamNotes(
        "[Pausado: 2026-12-05 | 10:20]: sin detergente\n[Reanudado: 2026-12-05 | 10:34]\nNota 1\nFalta un foco en el baño",
      ),
    ).toBe("Falta un foco en el baño");
  });

  it("sin notas, solo pausas, no hay nada que mostrar", () => {
    expect(
      teamNotes(
        "[Pausado: 2026-12-05 | 10:20]: almuerzo\n[Reanudado: 2026-12-05 | 11:00]",
      ),
    ).toBeNull();
    expect(teamNotes(null)).toBeNull();
  });

  it("quita los rótulos «Nota N»", () => {
    expect(teamNotes("Nota 1\nVidrio roto\nNota 2\nToalla manchada")).toBe(
      "Vidrio roto\nToalla manchada",
    );
  });
});

describe("resueltas por el supervisor", () => {
  it("separa las que van a corrección de las resueltas", () => {
    const findings = [
      finding({ id: 1 }),
      finding({ id: 2, resolvedBySupervisor: true }),
      finding({ id: 3 }),
    ];

    expect(pendingFindings(findings).map((f) => f.id)).toEqual([1, 3]);
    expect(resolvedFindings(findings).map((f) => f.id)).toEqual([2]);
  });
});

describe("isSupervisable (panel de SupervisorLimpieza)", () => {
  const task = (overrides: Partial<CleaningTask>) =>
    ({ id: 1, phase: "Completed", ...overrides }) as CleaningTask;

  it("lista las Completed, con o sin supervisión", () => {
    expect(isSupervisable(task({ supervision: null }))).toBe(true);
    expect(
      isSupervisable(
        task({
          supervision: {
            id: 5,
            phase: "InCorrection",
            phaseLabel: null,
            corrector: null,
          },
        }),
      ),
    ).toBe(true);
  });

  it("lista las Reviewed y nunca las que no terminaron", () => {
    expect(isSupervisable(task({ phase: "Reviewed" }))).toBe(true);
    expect(isSupervisable(task({ phase: "Assigned" }))).toBe(false);
    expect(isSupervisable(task({ phase: "InExecution" }))).toBe(false);
  });
});
