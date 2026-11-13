import { describe, expect, it } from "vitest";
import type { Authorization } from "@/modules/supervisor-cav/types/Authorization";
import { accessDoorsView } from "./accessDoors";

const base: Authorization = {
  id: "stay-1",
  guestName: "Marta Ruiz",
  unitLabel: "Inglaterra · UI R302",
  checkIn: "2026-10-08T18:00:00Z",
  checkOut: "2026-10-11T21:00:00Z",
  pinValidFrom: "2026-10-08T18:00:00Z",
  pinValidTo: "2026-10-11T21:00:00Z",
  accessLevel: "both",
  accessRevoked: null,
  desiredScopes: ["pedestrian", "vehicular"],
  confirmedScopes: ["pedestrian", "vehicular"],
  syncStatus: "confirmed",
  syncError: null,
};

const states = (a: Authorization) =>
  accessDoorsView(a).doors.map((door) => door.state);

describe("accessDoorsView", () => {
  it("todo aplicado: ambas activas y sin avisos", () => {
    const view = accessDoorsView(base);

    expect(states(base)).toEqual(["active", "active"]);
    expect(view.notice).toBeNull();
    expect(view.pendingNote).toBeNull();
  });

  it("quitando vehicular: avisa que el PIN aún abre la barrera", () => {
    const a: Authorization = {
      ...base,
      accessLevel: "pedestrian",
      desiredScopes: ["pedestrian"],
      syncStatus: "pending",
    };

    expect(states(a)).toEqual(["active", "removing"]);
    expect(accessDoorsView(a).pendingNote).toBe(
      "Hasta que la puerta lo confirme, el PIN todavía abre la entrada vehicular. Se reintenta solo.",
    );
  });

  it("activando vehicular", () => {
    const a: Authorization = {
      ...base,
      confirmedScopes: ["pedestrian"],
      syncStatus: "pending",
    };

    expect(states(a)).toEqual(["active", "activating"]);
    expect(accessDoorsView(a).pendingNote).toBe(
      "El PIN todavía no abre la entrada vehicular. Se reintenta solo.",
    );
  });

  it("fallo al quitar: aviso rojo con reintentar", () => {
    const a: Authorization = {
      ...base,
      accessLevel: "pedestrian",
      desiredScopes: ["pedestrian"],
      syncStatus: "failed",
    };

    expect(states(a)).toEqual(["active", "removeFailed"]);
    expect(accessDoorsView(a).notice).toEqual({
      tone: "red",
      title: "No se pudo quitar el acceso vehicular",
      body: "El PIN todavía abre la entrada vehicular.",
      retry: true,
    });
  });

  it("PIN en conflicto: nombra la entrada que no se activó", () => {
    const a: Authorization = {
      ...base,
      accessLevel: "pedestrian",
      desiredScopes: ["pedestrian"],
      confirmedScopes: ["pedestrian"],
      syncError: "pin_conflict",
    };

    expect(states(a)).toEqual(["active", "none"]);
    expect(accessDoorsView(a).notice).toMatchObject({
      tone: "amber",
      title: "No se activó el acceso vehicular",
      retry: false,
    });
  });

  it("revocado confirmado: sin lista de puertas", () => {
    const a: Authorization = {
      ...base,
      accessLevel: null,
      accessRevoked: { at: "2026-10-09T20:40:00Z", by: "jperez" },
      desiredScopes: [],
      confirmedScopes: [],
    };

    expect(accessDoorsView(a)).toMatchObject({ doors: [], settled: true });
  });

  it("revocado sin confirmar: lista por puerta y, si falló, reintentar", () => {
    const a: Authorization = {
      ...base,
      accessLevel: null,
      accessRevoked: { at: "2026-10-09T20:40:00Z", by: "jperez" },
      desiredScopes: [],
      confirmedScopes: ["pedestrian"],
      syncStatus: "failed",
    };

    expect(states(a)).toEqual(["removeFailed", "none"]);
    expect(accessDoorsView(a).notice).toMatchObject({
      title: "No se pudo quitar el PIN de las puertas",
      retry: true,
    });
  });

  it("sin los campos nuevos da por aplicado el nivel", () => {
    const a: Authorization = {
      ...base,
      accessLevel: "pedestrian",
      desiredScopes: undefined,
      confirmedScopes: undefined,
      syncStatus: undefined,
    };

    expect(states(a)).toEqual(["active", "none"]);
  });
});
