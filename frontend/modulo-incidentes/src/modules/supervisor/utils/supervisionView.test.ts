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
  initialsOf,
  pendingFindings,
  plural,
  pointLabel,
  resolvedFindings,
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

  it("deja fuera las Completed anteriores al corte", () => {
    expect(
      isSupervisable(task({ supervision: null, supervisionEligible: false })),
    ).toBe(false);
  });

  it("lista las Completed con supervisión o posteriores al corte", () => {
    expect(
      isSupervisable(task({ supervision: null, supervisionEligible: true })),
    ).toBe(true);
    expect(
      isSupervisable(
        task({
          supervisionEligible: false,
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

  it("siempre lista las Reviewed y nunca las demás fases", () => {
    expect(isSupervisable(task({ phase: "Reviewed" }))).toBe(true);
    expect(isSupervisable(task({ phase: "Assigned" }))).toBe(false);
  });

  it("con un backend sin estos campos, lista las Completed como antes", () => {
    expect(isSupervisable(task({}))).toBe(true);
  });
});
