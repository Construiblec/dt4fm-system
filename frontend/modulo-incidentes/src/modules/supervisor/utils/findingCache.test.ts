import { describe, expect, it } from "vitest";
import type {
  SupervisionDetail,
  SupervisionFinding,
} from "@/modules/supervisor/types/Supervision";
import {
  addFinding,
  patchFinding,
  removeFinding,
  removePhoto,
  replaceFinding,
  restoreFinding,
} from "@/modules/supervisor/utils/findingCache";

const finding = (id: number, extra: Partial<SupervisionFinding> = {}) =>
  ({
    id,
    index: 1,
    point: null,
    subcategory: { id: 21, name: "Manchas", isOther: false },
    observation: null,
    resolvedBySupervisor: false,
    photos: [],
    fixPhotos: [],
    ...extra,
  }) as SupervisionFinding;

const detail = (findings: SupervisionFinding[]) =>
  ({ id: 5000, findings }) as unknown as SupervisionDetail;

const ids = (d: SupervisionDetail) => d.findings.map((f) => f.id);

describe("findingCache (cambios optimistas)", () => {
  it("añade la temporal y la sustituye por la real", () => {
    const withTemp = addFinding(detail([finding(1)]), finding(-99, { syncing: "creating" }));
    expect(ids(withTemp)).toEqual([1, -99]);

    const real = replaceFinding(withTemp, -99, finding(7));
    expect(ids(real)).toEqual([1, 7]);
    expect(real.findings[1].syncing).toBeUndefined();
  });

  it("quita una novedad y la devuelve a su misma posición si falla", () => {
    const start = detail([finding(1), finding(2), finding(3)]);
    const { detail: without, removed, position } = removeFinding(start, 2);
    expect(ids(without)).toEqual([1, 3]);
    expect(position).toBe(1);

    const back = restoreFinding(without, removed as SupervisionFinding, position);
    expect(ids(back)).toEqual([1, 2, 3]);
    // Restaurar dos veces no la duplica.
    expect(ids(restoreFinding(back, removed as SupervisionFinding, position))).toEqual([1, 2, 3]);
  });

  it("quitar una novedad que no está no cambia nada", () => {
    const start = detail([finding(1)]);
    expect(removeFinding(start, 9)).toEqual({ detail: start, removed: null, position: -1 });
  });

  it("marca «resuelta» sin tocar las demás", () => {
    const next = patchFinding(detail([finding(1), finding(2)]), 2, {
      resolvedBySupervisor: true,
    });
    expect(next.findings.map((f) => f.resolvedBySupervisor)).toEqual([false, true]);
  });

  it("quita solo la foto indicada", () => {
    const photo = (id: string) => ({ id, fileName: null, uploadDate: null, downloadUrl: "/x" });
    const next = removePhoto(
      detail([finding(1, { photos: [photo("a"), photo("b")] })]),
      1,
      "a",
    );
    expect(next.findings[0].photos.map((p) => p.id)).toEqual(["b"]);
  });

  it("quita una foto del arreglo sin tocar las del supervisor", () => {
    const photo = (id: string) => ({ id, fileName: null, uploadDate: null, downloadUrl: "/x" });
    const next = removePhoto(
      detail([
        finding(1, { photos: [photo("a")], fixPhotos: [photo("a"), photo("b")] }),
      ]),
      1,
      "a",
      "fixPhotos",
    );
    expect(next.findings[0].fixPhotos.map((p) => p.id)).toEqual(["b"]);
    expect(next.findings[0].photos.map((p) => p.id)).toEqual(["a"]);
  });
});
