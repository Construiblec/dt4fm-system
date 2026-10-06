import { describe, expect, it } from "vitest";
import {
  hasWakeWord,
  recognizeCommand,
  type VoiceIntent,
} from "@/modules/incidentes/utils/voiceCommands";

const TODO: VoiceIntent[] = ["FIN", "NEGACION", "AFIRMACION"];
const SI_O_NO: VoiceIntent[] = ["AFIRMACION", "NEGACION"];
const SOLO_FIN: VoiceIntent[] = ["FIN"];

describe("recognizeCommand — lo que el operario dice de verdad", () => {
  it.each(["acabado", "acabé", "ya acabé", "terminado", "terminé", "ya terminé"])(
    "entiende %s como fin de actividad",
    (dicho) => {
      expect(recognizeCommand(dicho, TODO)).toBe("FIN");
    },
  );

  it.each(["sí", "si", "ya", "dale", "dele", "claro", "correcto", "bueno"])(
    "entiende %s como afirmación",
    (dicho) => {
      expect(recognizeCommand(dicho, TODO)).toBe("AFIRMACION");
    },
  );

  it.each(["no", "todavía no", "aún no", "negativo"])(
    "entiende %s como negación",
    (dicho) => {
      expect(recognizeCommand(dicho, TODO)).toBe("NEGACION");
    },
  );

  // La pregunta es "¿te acuerdas de los elementos?": esta es la respuesta
  // natural de alguien que no memorizó nada.
  it.each(["no me acuerdo", "no sé"])("entiende %s como negación", (dicho) => {
    expect(recognizeCommand(dicho, TODO)).toBe("NEGACION");
  });

  it("no se deja confundir por mayúsculas, tildes ni puntuación", () => {
    expect(recognizeCommand("¡SÍ!", TODO)).toBe("AFIRMACION");
    expect(recognizeCommand("Acabado.", TODO)).toBe("FIN");
  });

  // "ya acabé" contiene "ya", que es afirmación. Si ganara la frase corta, un
  // fin de actividad se leería como un simple sí y el bloque no se marcaría.
  it("la frase larga le gana a la corta", () => {
    expect(recognizeCommand("ya acabé", TODO)).toBe("FIN");
    expect(recognizeCommand("ya terminé", TODO)).toBe("FIN");
    expect(recognizeCommand("todavía no", TODO)).toBe("NEGACION");
  });
});

describe("recognizeCommand — palabra completa, no pedazo de palabra", () => {
  // "bueno" contiene "no": con búsqueda por substring se leería como negación.
  it("no lee 'no' dentro de 'bueno'", () => {
    expect(recognizeCommand("bueno", TODO)).toBe("AFIRMACION");
  });

  it("no saca un comando de una palabra que solo contiene otra", () => {
    expect(recognizeCommand("nosotros", TODO)).toBeNull();
    expect(recognizeCommand("sillón", TODO)).toBeNull();
  });
});

describe("recognizeCommand — las muletillas NO terminan una actividad", () => {
  // FIN está escuchando los quince minutos que dura el bloque. Estas tres son
  // frases de trabajo normales y, si estuvieran en la lista, marcarían el
  // bloque sin que nadie lo hubiera terminado.
  it.each(["listo", "hecho", "ya está"])(
    "%s no marca el bloque como terminado",
    (dicho) => {
      expect(recognizeCommand(dicho, SOLO_FIN)).toBeNull();
    },
  );

  it.each([
    "listo pásame el otro",
    "ya está el trapeador",
    "eso ya está hecho",
  ])("la frase de trabajo %s no marca nada", (dicho) => {
    expect(recognizeCommand(dicho, SOLO_FIN)).toBeNull();
  });
});

describe("recognizeCommand — el tope de palabras", () => {
  // El falso positivo real de la prueba de campo: 25 palabras de una
  // conversación ajena clasificadas como afirmación por contener "así es".
  it("descarta la frase que disparó el falso positivo en campo", () => {
    const charla =
      "fotos de minutos y cuando le transferimos de información a Rich no es " +
      "imposible que deje minutos abierto pero es así es lo que";

    expect(recognizeCommand(charla, TODO)).toBeNull();
  });

  it("acepta hasta cuatro palabras y rechaza la quinta", () => {
    expect(recognizeCommand("ya acabé con esto", TODO)).toBe("FIN");
    expect(recognizeCommand("ya acabé con esto jefe", TODO)).toBeNull();
  });

  it("una charla larga que contiene 'acabado' no marca la actividad", () => {
    const charla = "el otro día me dijeron que eso ya estaba acabado desde antes";

    expect(recognizeCommand(charla, TODO)).toBeNull();
  });
});

describe("recognizeCommand — solo se oye lo que se está esperando", () => {
  // La barrera más efectiva: mientras se espera "acabado", un "sí" suelto de
  // una conversación no puede dar por terminada la actividad.
  it("ignora un sí mientras se espera el fin de la actividad", () => {
    expect(recognizeCommand("sí", SOLO_FIN)).toBeNull();
    expect(recognizeCommand("dale", SOLO_FIN)).toBeNull();
    expect(recognizeCommand("ya", SOLO_FIN)).toBeNull();
  });

  it("ignora un 'acabado' mientras se espera sí o no", () => {
    expect(recognizeCommand("acabado", SI_O_NO)).toBeNull();
  });

  it("sigue entendiendo lo que sí corresponde", () => {
    expect(recognizeCommand("acabado", SOLO_FIN)).toBe("FIN");
    expect(recognizeCommand("no", SI_O_NO)).toBe("NEGACION");
    expect(recognizeCommand("sí", SI_O_NO)).toBe("AFIRMACION");
  });

  it("sin nada esperado no reconoce nada", () => {
    expect(recognizeCommand("acabado", [])).toBeNull();
  });
});

describe("recognizeCommand — entradas vacías", () => {
  it.each(["", "   ", "...", "123"])("devuelve null con %s", (dicho) => {
    expect(recognizeCommand(dicho, TODO)).toBeNull();
  });
});

describe("hasWakeWord", () => {
  it.each(["asistente", "oye asistente", "Asistente, acabado", "¡ASISTENTE!"])(
    "reconoce la activación en %s",
    (dicho) => {
      expect(hasWakeWord(dicho)).toBe(true);
    },
  );

  it.each(["acabado", "ya terminé", "", "asistentes", "existente"])(
    "no la reconoce en %s",
    (dicho) => {
      expect(hasWakeWord(dicho)).toBe(false);
    },
  );
});

describe("recognizeCommand — la palabra de activación", () => {
  const CON_ACTIVACION = { requireWake: true };

  // EL BUG DE LA REUNIÓN. Mientras se presentaba la función, alguien dijo
  // "acabado" en medio de una frase y el asistente marcó el bloque: la pausa
  // antes de la palabra abrió un segmento nuevo de UNA sola palabra, idéntico
  // al de un comando deliberado. Estos dos tests lo dejan clavado.
  it("un 'acabado' pelado ya no termina la actividad", () => {
    expect(recognizeCommand("acabado", SOLO_FIN, CON_ACTIVACION)).toBeNull();
  });

  it("un 'acabado' dicho al pasar tampoco", () => {
    expect(
      recognizeCommand("y ahí dice acabado", SOLO_FIN, CON_ACTIVACION),
    ).toBeNull();
  });

  it.each(["asistente acabado", "asistente, acabado", "oye asistente acabado"])(
    "%s sí la termina",
    (dicho) => {
      expect(recognizeCommand(dicho, SOLO_FIN, CON_ACTIVACION)).toBe("FIN");
    },
  );

  // El tope de palabras sigue haciendo falta: sin él, una frase larga que
  // mencione las dos palabras volvería a colarse.
  it("una frase larga con 'asistente' y 'acabado' no cuenta", () => {
    expect(
      recognizeCommand(
        "el asistente marca el bloque cuando uno dice acabado",
        SOLO_FIN,
        CON_ACTIVACION,
      ),
    ).toBeNull();
  });

  // Dentro de la ventana que abre "asistente", el hook llama SIN requireWake:
  // ahí un "acabado" pelado sí tiene que contar.
  it("sin la exigencia puesta, un 'acabado' pelado vuelve a contar", () => {
    expect(recognizeCommand("acabado", SOLO_FIN)).toBe("FIN");
    expect(recognizeCommand("acabado", SOLO_FIN, { requireWake: false })).toBe(
      "FIN",
    );
  });

  // El sí/no no lleva activación: vive unos segundos tras una pregunta directa
  // y equivocarse ahí no da trabajo por hecho.
  it("el sí y el no siguen sin necesitar activación", () => {
    expect(recognizeCommand("sí", SI_O_NO)).toBe("AFIRMACION");
    expect(recognizeCommand("no", SI_O_NO)).toBe("NEGACION");
  });
});

describe("'listo' está del lado seguro", () => {
  // El ticket lo pide como variante natural de afirmación. Ahí solo escucha unos
  // segundos tras una pregunta directa, así que el riesgo es mínimo.
  it("cuenta como afirmación al contestar la pregunta del bloque", () => {
    expect(recognizeCommand("listo", SI_O_NO)).toBe("AFIRMACION");
  });

  // Y sigue SIN contar como fin de actividad, que es donde era peligroso: ahí
  // escucha los quince minutos que dura el bloque.
  it("nunca da por terminada una actividad", () => {
    expect(recognizeCommand("listo", SOLO_FIN)).toBeNull();
    expect(
      recognizeCommand("asistente listo", SOLO_FIN, { requireWake: true }),
    ).toBeNull();
  });
});

describe("recognizeCommand — el comando de repetir", () => {
  const SOLO_REPETIR: VoiceIntent[] = ["REPETIR"];
  const CON_ACTIVACION = { requireWake: true };

  it.each(["repite", "repetir", "repíteme", "otra vez", "de nuevo"])(
    "entiende %s",
    (dicho) => {
      expect(recognizeCommand(dicho, SOLO_REPETIR)).toBe("REPETIR");
    },
  );

  // Convive con FIN durante todo el trabajo del bloque, así que lleva la misma
  // barrera: un "de nuevo" de una charla no puede poner a hablar al teléfono.
  it("exige la palabra de activación", () => {
    expect(recognizeCommand("repite", SOLO_REPETIR, CON_ACTIVACION)).toBeNull();
    expect(
      recognizeCommand("asistente, repite", SOLO_REPETIR, CON_ACTIVACION),
    ).toBe("REPETIR");
  });

  it("no se confunde con terminar la actividad", () => {
    expect(recognizeCommand("repite", ["FIN"])).toBeNull();
    expect(recognizeCommand("acabado", SOLO_REPETIR)).toBeNull();
  });
});
