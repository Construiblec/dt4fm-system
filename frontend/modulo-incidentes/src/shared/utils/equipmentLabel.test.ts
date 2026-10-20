import { describe, expect, it } from "vitest";
import { equipmentLabel } from "./equipmentLabel";

describe("equipmentLabel", () => {
  it("no repite el código si la descripción ya lo trae", () => {
    expect(equipmentLabel("BOMB", "BOMB - Bomba de agua")).toBe(
      "BOMB - Bomba de agua",
    );
  });

  it("antepone el código cuando falta", () => {
    expect(equipmentLabel("BOMB", "Bomba de agua")).toBe(
      "BOMB - Bomba de agua",
    );
    expect(equipmentLabel("BOMB", null)).toBe("BOMB");
  });
});
