import { describe, expect, it } from "vitest";
import { parseIotAlarm } from "@/shared/utils/iotAlarmNote";

describe("parseIotAlarm", () => {
  it("separa el mensaje y las filas de una alarma IoT", () => {
    const alarm = parseIotAlarm(
      [
        "Alarma automática del Sistema IoT: Presion baja en tanque GLP.",
        "Lectura: 1.5 psi.",
        "Equipo: SPR-1 (sensor GLP001).",
        "Detectada: 07/10/2026 07:15.",
        "Evento: GLP1_LOW_PRESSURE.",
      ].join("\n"),
    );

    expect(alarm?.message).toBe("Presion baja en tanque GLP");
    expect(alarm?.rows).toEqual([
      { label: "Lectura", value: "1.5 psi" },
      { label: "Equipo", value: "SPR-1 (sensor GLP001)" },
      { label: "Detectada", value: "07/10/2026 07:15" },
      { label: "Evento", value: "GLP1_LOW_PRESSURE" },
    ]);
    expect(alarm?.warnings).toEqual([]);
  });

  it("deja los avisos fuera de las filas", () => {
    const alarm = parseIotAlarm(
      'Alarma automática del Sistema IoT: Fuga.\nAVISO: no existe ningún activo con el código "X".\nEvento: LEAK.',
    );

    expect(alarm?.warnings).toEqual([
      'no existe ningún activo con el código "X".',
    ]);
    expect(alarm?.rows).toEqual([{ label: "Evento", value: "LEAK" }]);
  });

  it.each([
    "Fuga de agua bajo el lavamanos.",
    "Alarma automática registrada por Sistema IoT.\nbuilding: Pradera",
  ])("una nota que no sigue el formato no es una alarma (%s)", (notes) => {
    expect(parseIotAlarm(notes)).toBeNull();
  });
});
