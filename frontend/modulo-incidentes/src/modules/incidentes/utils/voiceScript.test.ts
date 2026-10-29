import { describe, expect, it } from "vitest";
import {
  activityAnnouncement,
  blockQuestion,
  COMMAND_HINT,
  reminderPhrase,
  resumeBlockPhrase,
  resumeMode,
} from "@/modules/incidentes/utils/voiceScript";

describe("lo que dice el asistente", () => {
  it("abre cada bloque preguntando por las tareas", () => {
    expect(blockQuestion("Baño")).toBe("Baño. ¿Recuerdas las tareas?");
    expect(blockQuestion(null)).toBe("Esta sección. ¿Recuerdas las tareas?");
  });

  // La fórmula se dice una vez por bloque, no después de cada actividad.
  it("solo la actividad que abre el bloque lleva la fórmula", () => {
    expect(activityAnnouncement("Limpiar inodoro", true)).toBe(
      `Limpiar inodoro. ${COMMAND_HINT}`,
    );
    expect(activityAnnouncement("Limpiar lavamanos", false)).toBe(
      "Limpiar lavamanos.",
    );
  });

  it("el aviso por tiempo nombra lo pendiente, sin la fórmula", () => {
    expect(reminderPhrase("Actividad: Limpiar lavamanos")).toBe(
      "¿Acabaste? Actividad: Limpiar lavamanos.",
    );
    expect(reminderPhrase("Baño")).not.toContain("asistente");
  });

  it("al retomar un bloque entero lo nombra", () => {
    expect(resumeBlockPhrase("Cocina")).toBe("Seguimos con Cocina.");
    expect(resumeBlockPhrase(null)).toBe("Seguimos con este bloque.");
  });
});

describe("resumeMode — al volver a encender", () => {
  // EL BUG DE LA PRUEBA: al apagar y encender volvía a preguntar, y con "no"
  // empezaba de nuevo a dictar las actividades.
  it("sigue en el mismo bloque con el modo que tenía", () => {
    expect(resumeMode({ sectionIndex: 2, mode: "actividad" }, 2)).toBe(
      "actividad",
    );
    expect(resumeMode({ sectionIndex: 0, mode: "bloque" }, 0)).toBe("bloque");
  });

  // Mientras estaba apagado el operario marcó el bloque con el dedo: lo
  // pendiente es otro bloque, y ese se pregunta como siempre.
  it("pregunta si lo pendiente ya es otro bloque", () => {
    expect(resumeMode({ sectionIndex: 1, mode: "actividad" }, 2)).toBeNull();
  });

  it("pregunta si no había nada que retomar", () => {
    expect(resumeMode(null, 0)).toBeNull();
  });

  it("no retoma nada con el checklist completo", () => {
    expect(resumeMode({ sectionIndex: 1, mode: "bloque" }, -1)).toBeNull();
  });
});
