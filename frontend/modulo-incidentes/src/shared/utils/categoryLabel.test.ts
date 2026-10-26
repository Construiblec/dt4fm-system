import { describe, expect, it } from "vitest";
import { categoryLabel, correctiveTitle } from "./categoryLabel";

const other = { name: "Otro", isOther: true };
const plumbing = { name: "Plomería", isOther: false };

describe("categoryLabel", () => {
  it("muestra solo la categoría si la subcategoría no es «Otro»", () => {
    expect(categoryLabel({ name: "Mantenimiento" }, plumbing)).toBe(
      "Mantenimiento",
    );
  });

  it("añade «Otro» cuando corresponde", () => {
    expect(categoryLabel({ name: "Mantenimiento" }, other)).toBe(
      "Mantenimiento · Otro",
    );
  });

  it("devuelve null sin categoría", () => {
    expect(categoryLabel(null, null)).toBeNull();
  });
});

describe("correctiveTitle", () => {
  it("usa la subcategoría o el texto de «Otro»", () => {
    expect(correctiveTitle(plumbing, "ignorado")).toBe("Plomería");
    expect(correctiveTitle(other, "  Puerta descuadrada ")).toBe(
      "Puerta descuadrada",
    );
    expect(correctiveTitle(null, "x")).toBe("");
  });
});
