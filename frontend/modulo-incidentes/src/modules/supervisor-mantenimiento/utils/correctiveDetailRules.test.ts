import { describe, expect, it } from "vitest";
import {
  getCorrectiveActions,
  getCorrectiveNotice,
} from "./correctiveDetailRules";

const base = {
  statusCode: "Assignment",
  isClosed: false,
  assignee: null,
  execEndDate: null,
};

describe("getCorrectiveActions", () => {
  it("en asignación permite asignar y rechazar, no reasignar", () => {
    expect(getCorrectiveActions(base)).toEqual({
      canAssign: true,
      canReject: true,
      pendingReview: false,
      canReassign: false,
    });
  });

  it("un reabierto conserva el responsable y sigue siendo asignable", () => {
    const actions = getCorrectiveActions({
      ...base,
      assignee: { name: "Ana" },
    });
    expect(actions.canAssign).toBe(true);
    expect(actions.canReassign).toBe(false);
  });

  it("por aprobar solo ofrece la revisión", () => {
    expect(
      getCorrectiveActions({
        ...base,
        statusCode: "Accounting",
        assignee: { name: "Ana" },
      }),
    ).toEqual({
      canAssign: false,
      canReject: false,
      pendingReview: true,
      canReassign: false,
    });
  });

  it("reasigna en ejecución pero no si está cerrado", () => {
    const running = {
      ...base,
      statusCode: "Execution",
      assignee: { name: "Ana" },
    };
    expect(getCorrectiveActions(running).canReassign).toBe(true);
    expect(
      getCorrectiveActions({ ...running, isClosed: true }).canReassign,
    ).toBe(false);
  });
});

describe("getCorrectiveNotice", () => {
  it("avisa de lo que falta en asignación", () => {
    expect(getCorrectiveNotice(base)?.title).toBe(
      "Falta asignar este correctivo",
    );
  });

  it("nombra a quien terminó el trabajo", () => {
    const notice = getCorrectiveNotice({
      ...base,
      statusCode: "Accounting",
      assignee: { name: "Servitec" },
      execEndDate: "2026-10-08T11:30:00",
    });
    expect(notice?.tone).toBe("indigo");
    expect(notice?.message).toMatch(/^Servitec lo terminó el /);
  });

  it("no avisa en ejecución ni cerrado", () => {
    expect(
      getCorrectiveNotice({ ...base, statusCode: "Execution" }),
    ).toBeNull();
    expect(
      getCorrectiveNotice({ ...base, statusCode: "Completed" }),
    ).toBeNull();
  });
});
