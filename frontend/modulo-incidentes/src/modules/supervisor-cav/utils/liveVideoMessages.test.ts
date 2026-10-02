import { describe, expect, it } from "vitest";
import { backendFailure, whepFailure } from "./liveVideoMessages";

describe("backendFailure", () => {
  it("una cámara retirada pide releer el catálogo", () => {
    expect(backendFailure("not_found", 404)).toEqual({
      message: "La cámara ya no existe.",
      action: "refresh",
    });
  });

  it("sin cupos se puede reintentar", () => {
    expect(backendFailure("live_capacity_reached", 503).action).toBe("retry");
  });

  it("una avería de integración no se reintenta", () => {
    expect(backendFailure("device_ambiguous", 502).action).toBe("none");
    expect(backendFailure("invalid_request", 502).action).toBe("none");
  });

  it("un 403 sin código es falta de rol", () => {
    expect(backendFailure(undefined, 403).message).toBe(
      "No tienes permiso para ver las cámaras.",
    );
  });

  it("lo desconocido cae en video no disponible", () => {
    expect(backendFailure("otro", 500)).toEqual({
      message: "Video no disponible.",
      action: "retry",
    });
  });
});

describe("whepFailure", () => {
  it("el 403 es el origen de la página aunque el código diga unauthorized", () => {
    expect(whepFailure(403, "unauthorized")).toEqual({
      message: "Este sitio no está autorizado para ver video. Avisa a Sistemas.",
      action: "none",
    });
  });

  it("el 401 es un ticket gastado o caducado: otra sesión", () => {
    expect(whepFailure(401, "unauthorized").action).toBe("retry");
  });

  it("distingue cámara sin señal, plazo vencido y red caída", () => {
    expect(whepFailure(502, "camera_unreachable").message).toBe("Cámara sin señal.");
    expect(whepFailure(0, "timeout").message).toBe("La cámara no respondió a tiempo.");
    expect(whepFailure(0, "network").action).toBe("retry");
  });

  it("un 400 es un error del cliente que hay que corregir", () => {
    expect(whepFailure(400, "invalid_request").action).toBe("none");
  });
});
