import { describe, expect, it } from "vitest";
import {
  REMINDER_REPEAT_MS,
  reminderDelayMs,
} from "@/modules/incidentes/utils/voiceReminder";

describe("reminderDelayMs", () => {
  it("el primer aviso llega al cumplirse los minutos del bloque", () => {
    expect(reminderDelayMs(16, 0)).toBe(16 * 60_000);
    expect(reminderDelayMs(4, 0)).toBe(4 * 60_000);
  });

  it("a partir del segundo insiste cada dos minutos", () => {
    expect(reminderDelayMs(16, 1)).toBe(REMINDER_REPEAT_MS);
    expect(reminderDelayMs(16, 7)).toBe(REMINDER_REPEAT_MS);
    expect(REMINDER_REPEAT_MS).toBe(120_000);
  });

  // Una plantilla a medio llenar no tiene contra qué comparar: avisar por un
  // tiempo inventado sería peor que callarse.
  it.each([null, 0, -5])("un bloque con minutos %s no avisa nunca", (minutos) => {
    expect(reminderDelayMs(minutos, 0)).toBeNull();
    expect(reminderDelayMs(minutos, 3)).toBeNull();
  });

  it("no se rompe con un valor que no es un número", () => {
    expect(reminderDelayMs(Number.NaN, 0)).toBeNull();
    expect(reminderDelayMs(Number.POSITIVE_INFINITY, 0)).toBeNull();
  });

  // Los minutos de la plantilla admiten decimales (el CSV acepta "2,5").
  it("redondea los minutos decimales a milisegundos enteros", () => {
    expect(reminderDelayMs(2.5, 0)).toBe(150_000);
  });
});
