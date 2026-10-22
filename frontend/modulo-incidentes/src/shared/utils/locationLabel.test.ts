import { describe, expect, it } from "vitest";
import { formatPlace, withoutCode } from "./locationLabel";

describe("withoutCode", () => {
  it("quita el código de «Código - Nombre»", () => {
    expect(withoutCode("REP3 - Proy2")).toBe("Proy2");
  });

  it("deja igual lo que no trae código", () => {
    expect(withoutCode("Torre Quito")).toBe("Torre Quito");
    expect(withoutCode("Suite 804 - Baño")).toBe("Suite 804 - Baño");
  });
});

describe("formatPlace", () => {
  it("prefiere el área a la planta", () => {
    expect(formatPlace("REP3 - Proy2", "U-12 - Depto 12", "R-P2 - Planta 2")).toBe(
      "Proy2 · Depto 12",
    );
  });

  it("cae a la planta sin área y a null sin nada", () => {
    expect(formatPlace("Torre Quito", null, "Planta 2")).toBe("Torre Quito · Planta 2");
    expect(formatPlace(null, null, null)).toBeNull();
  });
});
