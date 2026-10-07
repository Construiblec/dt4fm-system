import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  afterSession,
  AUDIO_SETTLE_MS,
  createVoiceAudio,
  ITEM_PAUSE_MS,
  MAX_FAILURES,
  MIC_RELEASE_MAX_MS,
  pickSpanishVoice,
  QUICK_SESSION_MS,
  REARM_DELAYS_MS,
  speechFallbackMs,
  STILL_SPEAKING_POLL_MS,
  type SpeechRecognitionLike,
  type VoiceFailure,
} from "@/modules/incidentes/utils/voiceAudio";

/**
 * Un reconocedor como el de Chrome: `start()` sobre una sesión abierta tira, y
 * `abort()` avisa que cerró un momento después (o nunca, si así se pide).
 */
class FakeRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onend: SpeechRecognitionLike["onend"] = null;

  running = false;
  starts = 0;
  aborts = 0;
  /** Lo que tarda en avisar que cerró tras `abort()`. `null`: no avisa nunca. */
  closeDelayMs: number | null = 50;

  start() {
    if (this.running) throw new Error("InvalidStateError");
    this.running = true;
    this.starts += 1;
  }

  stop() {
    this.abort();
  }

  abort() {
    this.aborts += 1;
    if (!this.running || this.closeDelayMs === null) return;
    setTimeout(() => this.end("aborted"), this.closeDelayMs);
  }

  /** Oye algo, como un resultado parcial. */
  hear(transcript: string) {
    this.onresult?.({
      results: [Object.assign([{ transcript }], { isFinal: false })],
    });
  }

  /** La sesión termina, con el error que avise el navegador si hay. */
  end(error?: string) {
    if (!this.running) return;
    if (error) this.onerror?.({ error });
    this.running = false;
    this.onend?.();
  }
}

/**
 * Una voz como la del navegador: la frase suena hasta que el test la termina, y
 * `cancel()` corta la que suena avisando con un error, como Chrome.
 */
const fakeOutput = () => {
  const spoken: string[] = [];
  let current: { onEnd: () => void; onError: (error: string) => void } | null =
    null;

  const output = {
    busy: () => current !== null,
    cancel: vi.fn(() => {
      const cut = current;
      current = null;
      cut?.onError("interrupted");
    }),
    speak: vi.fn(
      (text: string, onEnd: () => void, onError: (error: string) => void) => {
        spoken.push(text);
        current = { onEnd, onError };
      },
    ),
  };

  return {
    output,
    spoken,
    /** La frase termina y el navegador lo avisa. */
    finish: () => {
      const done = current;
      current = null;
      done?.onEnd();
    },
    /** La frase termina sin aviso, como en algunos navegadores. */
    finishQuietly: () => {
      current = null;
    },
    /** El navegador rechaza la frase. */
    reject: (error: string) => {
      const failed = current;
      current = null;
      failed?.onError(error);
    },
  };
};

const setup = () => {
  const recognition = new FakeRecognition();
  const voice = fakeOutput();
  let hidden = false;
  let visibleListener: (() => void) | null = null;
  const events = {
    onTranscript: vi.fn<(text: string) => void>(),
    onPhase: vi.fn<(phase: "hablando" | "escuchando") => void>(),
    onSaying: vi.fn<(text: string) => void>(),
    onFailure: vi.fn<(failure: VoiceFailure) => void>(),
  };

  const audio = createVoiceAudio(
    {
      createRecognition: () => recognition,
      output: voice.output,
      isHidden: () => hidden,
      onVisible: (listener) => {
        visibleListener = listener;
        return () => {
          visibleListener = null;
        };
      },
    },
    events,
  );
  audio.activate();

  return {
    audio,
    recognition,
    voice,
    events,
    hide: () => {
      hidden = true;
    },
    show: () => {
      hidden = false;
      visibleListener?.();
    },
  };
};

type Harness = ReturnType<typeof setup>;

const FIRST = "Dormitorio. ¿Te acuerdas de los elementos?";

/** Dice una frase y la deja terminar: el asistente queda escuchando. */
const startListening = (h: Harness) => {
  h.audio.say([FIRST]);
  vi.advanceTimersByTime(0);
  h.voice.finish();
  vi.advanceTimersByTime(ITEM_PAUSE_MS);
  expect(h.recognition.running).toBe(true);
};

/** Cuánto pasa hasta que se vuelve a abrir el micrófono, o `Infinity` si no se abre. */
const waitForStart = (h: Harness, cap = 30_000): number => {
  const before = h.recognition.starts;
  for (let waited = 0; waited <= cap; waited += 50) {
    if (h.recognition.starts > before) return waited;
    vi.advanceTimersByTime(50);
  }
  return Number.POSITIVE_INFINITY;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("antes de hablar", () => {
  // En Android, una voz que arranca con el micrófono todavía abierto puede
  // salir muda: era la causa más probable de que "a veces no hable".
  it("no habla hasta que el reconocimiento avisa que soltó el micrófono", () => {
    const h = setup();
    startListening(h);

    h.audio.say(["Baño. ¿Te acuerdas de los elementos?"]);

    expect(h.recognition.aborts).toBe(1);
    vi.advanceTimersByTime(49);
    expect(h.voice.spoken).toEqual([FIRST]);

    vi.advanceTimersByTime(1);
    expect(h.recognition.running).toBe(false);
    vi.advanceTimersByTime(AUDIO_SETTLE_MS - 1);
    expect(h.voice.spoken).toEqual([FIRST]);

    vi.advanceTimersByTime(1);
    expect(h.voice.spoken).toEqual([FIRST, "Baño. ¿Te acuerdas de los elementos?"]);
  });

  it("si el reconocimiento no avisa, habla igual a los 400 ms", () => {
    const h = setup();
    startListening(h);
    h.recognition.closeDelayMs = null;

    h.audio.say(["Siguiente"]);

    vi.advanceTimersByTime(MIC_RELEASE_MAX_MS + AUDIO_SETTLE_MS - 1);
    expect(h.voice.spoken).not.toContain("Siguiente");
    vi.advanceTimersByTime(1);
    expect(h.voice.spoken).toContain("Siguiente");
  });

  // Un `cancel()` de más llega tarde al motor y se lleva la frase siguiente.
  it("si no suena nada, no cancela y habla en el acto", () => {
    const h = setup();

    h.audio.say(["Hola"]);
    vi.advanceTimersByTime(0);

    expect(h.voice.spoken).toEqual(["Hola"]);
    expect(h.voice.output.cancel).not.toHaveBeenCalled();
  });

  it("si algo suena, lo cancela y espera antes de hablar", () => {
    const h = setup();
    h.audio.say(["Primera"]);
    vi.advanceTimersByTime(0);

    h.audio.say(["Segunda"]);

    expect(h.voice.output.cancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(AUDIO_SETTLE_MS - 1);
    expect(h.voice.spoken).toEqual(["Primera"]);
    vi.advanceTimersByTime(1);
    expect(h.voice.spoken).toEqual(["Primera", "Segunda"]);
  });

  it("lo que llega del micrófono mientras se cierra para hablar no se entrega", () => {
    const h = setup();
    startListening(h);

    h.audio.say(["Siguiente"]);
    h.recognition.hear("asistente acabado");

    expect(h.events.onTranscript).not.toHaveBeenCalled();
  });
});

// Tocar un bloque mientras el asistente hablaba dejaba viva la lectura vieja.
describe("turnos", () => {
  it("una frase nueva deja sin efecto la anterior: ni la sigue, ni su onDone, ni abre el micrófono", () => {
    const h = setup();
    const onDoneVieja = vi.fn();
    h.audio.say(["Uno", "Dos"], onDoneVieja);
    vi.advanceTimersByTime(0);

    h.audio.say(["Otra cosa"]);
    vi.advanceTimersByTime(AUDIO_SETTLE_MS);
    expect(h.voice.spoken).toEqual(["Uno", "Otra cosa"]);

    // Mientras dice "Otra cosa", nada de lo viejo abre el micrófono.
    vi.advanceTimersByTime(ITEM_PAUSE_MS);
    expect(h.recognition.starts).toBe(0);

    h.voice.finish();
    vi.advanceTimersByTime(ITEM_PAUSE_MS);
    expect(h.recognition.starts).toBe(1);

    // Ni siquiera cuando vencen los respaldos de la frase vieja.
    vi.advanceTimersByTime(2 * speechFallbackMs("Uno") + ITEM_PAUSE_MS);
    expect(h.voice.spoken).toEqual(["Uno", "Otra cosa"]);
    expect(onDoneVieja).not.toHaveBeenCalled();
    expect(h.recognition.starts).toBe(1);
  });

  it("dice varias frases en orden, con una pausa entre ellas, y al final llama a onDone y escucha", () => {
    const h = setup();
    const onDone = vi.fn(() => {
      // `onDone` corre antes de reabrir el micrófono.
      expect(h.recognition.running).toBe(false);
    });

    h.audio.say(["Baño listo.", "Cocina. ¿Te acuerdas de los elementos?"], onDone);
    vi.advanceTimersByTime(0);
    h.voice.finish();
    vi.advanceTimersByTime(ITEM_PAUSE_MS - 1);
    expect(h.voice.spoken).toEqual(["Baño listo."]);
    vi.advanceTimersByTime(1);
    expect(h.voice.spoken).toEqual([
      "Baño listo.",
      "Cocina. ¿Te acuerdas de los elementos?",
    ]);

    h.voice.finish();
    vi.advanceTimersByTime(ITEM_PAUSE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(h.recognition.running).toBe(true);
  });
});

describe("respaldo de cada frase", () => {
  it("mientras la voz siga sonando no abre el micrófono, aunque se cumpla el respaldo", () => {
    const h = setup();
    h.audio.say(["Limpiar y desinfectar lavamanos, grifería y espejos."]);
    vi.advanceTimersByTime(0);

    vi.advanceTimersByTime(
      speechFallbackMs("Limpiar y desinfectar lavamanos, grifería y espejos.") +
        ITEM_PAUSE_MS,
    );
    expect(h.recognition.starts).toBe(0);

    h.voice.finishQuietly();
    vi.advanceTimersByTime(STILL_SPEAKING_POLL_MS + ITEM_PAUSE_MS);
    expect(h.recognition.starts).toBe(1);
  });

  it("si el navegador nunca avisa que terminó, sigue al cumplirse el respaldo", () => {
    const h = setup();
    h.audio.say(["Hola"]);
    vi.advanceTimersByTime(0);
    h.voice.finishQuietly();

    vi.advanceTimersByTime(speechFallbackMs("Hola") + ITEM_PAUSE_MS - 1);
    expect(h.recognition.starts).toBe(0);
    vi.advanceTimersByTime(1);
    expect(h.recognition.starts).toBe(1);
  });

  it("si la voz parece sonar para siempre, se rinde al doble del respaldo", () => {
    const h = setup();
    h.audio.say(["Hola"]);
    vi.advanceTimersByTime(0);

    vi.advanceTimersByTime(
      2 * speechFallbackMs("Hola") + STILL_SPEAKING_POLL_MS + ITEM_PAUSE_MS,
    );
    expect(h.recognition.starts).toBe(1);
  });

  it("crece con la frase y deja tiempo de sobra para leerla", () => {
    const larga = "a".repeat(200);

    expect(speechFallbackMs(larga)).toBeGreaterThan(speechFallbackMs("a".repeat(40)));
    // El respaldo fijo de antes, 10 s, cortaba una actividad así a media lectura.
    expect(speechFallbackMs(larga)).toBeGreaterThan(10_000);
    // Una voz en español dice unos 14 caracteres por segundo.
    expect(speechFallbackMs(larga)).toBeGreaterThan((larga.length / 14) * 1000);
  });

  it("si la voz falla por otro motivo, pasa a la frase siguiente", () => {
    const h = setup();
    h.audio.say(["Uno", "Dos"]);
    vi.advanceTimersByTime(0);

    h.voice.reject("synthesis-failed");
    vi.advanceTimersByTime(ITEM_PAUSE_MS);

    expect(h.voice.spoken).toEqual(["Uno", "Dos"]);
    expect(h.events.onFailure).not.toHaveBeenCalled();
  });
});

describe("reabrir el micrófono", () => {
  // Android cierra la escucha tras unos segundos de silencio: es normal, y
  // reabrir tarde haría que el operario hablara sobre un micrófono cerrado.
  it("tras un silencio normal, reabre a los 300 ms", () => {
    const h = setup();
    startListening(h);

    vi.advanceTimersByTime(6000);
    h.recognition.end("no-speech");

    expect(waitForStart(h)).toBe(REARM_DELAYS_MS[0]);
  });

  // Reabrir siempre a los 300 ms era el bucle de pitidos.
  it("los cortes rápidos seguidos se espacian: 300 ms, 1 s y 3 s, sin pausar si no hay un error claro", () => {
    const h = setup();
    startListening(h);
    const waits: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      h.recognition.end();
      waits.push(waitForStart(h));
    }

    expect(waits).toEqual([300, 1000, 3000, 3000, 3000]);
    expect(h.events.onFailure).not.toHaveBeenCalled();
  });

  it.each([
    ["network", "sin-conexion"],
    ["audio-capture", "microfono-no-disponible"],
  ] as const)(
    "con el error %s, al cuarto corte seguido se pausa y avisa %s",
    (error, failure) => {
      const h = setup();
      startListening(h);

      for (let i = 1; i < MAX_FAILURES; i += 1) {
        // Cuenta aunque cada intento tarde en fallar.
        vi.advanceTimersByTime(QUICK_SESSION_MS * 2);
        h.recognition.end(error);
        expect(waitForStart(h)).toBeLessThan(Number.POSITIVE_INFINITY);
      }

      h.recognition.end(error);

      expect(h.events.onFailure).toHaveBeenCalledWith(failure);
      expect(waitForStart(h)).toBe(Number.POSITIVE_INFINITY);
    },
  );

  it("oír cualquier cosa reinicia la cuenta", () => {
    const h = setup();
    startListening(h);
    h.recognition.end();
    waitForStart(h);
    h.recognition.end();
    waitForStart(h);

    h.recognition.hear("asistente");
    h.recognition.end();

    expect(h.events.onTranscript).toHaveBeenCalledWith("asistente");
    expect(waitForStart(h)).toBe(REARM_DELAYS_MS[0]);
    h.recognition.end();
    expect(waitForStart(h)).toBe(REARM_DELAYS_MS[0]);
  });

  it.each(["not-allowed", "service-not-allowed"])(
    "sin permiso de micrófono (%s) se pausa en el acto",
    (error) => {
      const h = setup();
      startListening(h);

      h.recognition.end(error);

      expect(h.events.onFailure).toHaveBeenCalledWith("sin-microfono");
      expect(waitForStart(h)).toBe(Number.POSITIVE_INFINITY);
    },
  );

  it("si start() falla porque la sesión anterior no cerró, lo reintenta", () => {
    const h = setup();
    // Una sesión que el navegador todavía no dio por cerrada.
    h.recognition.running = true;

    h.audio.say(["Hola"]);
    vi.advanceTimersByTime(0);
    h.voice.finish();
    vi.advanceTimersByTime(ITEM_PAUSE_MS);
    expect(h.recognition.starts).toBe(0);

    h.recognition.running = false;
    expect(waitForStart(h)).toBe(REARM_DELAYS_MS[0]);
  });
});

describe("página oculta", () => {
  // Bloquear el teléfono o cambiar de app no puede dejar al asistente en pausa.
  it("si la escucha se corta con la página oculta, no reintenta ni cuenta; al volver, escucha", () => {
    const h = setup();
    startListening(h);
    // Ya venía cortándose por la red: con la página a la vista, un corte más
    // lo pausaría.
    for (let i = 1; i < MAX_FAILURES; i += 1) {
      h.recognition.end("network");
      waitForStart(h);
    }

    h.hide();
    h.recognition.end("network");
    expect(waitForStart(h)).toBe(Number.POSITIVE_INFINITY);
    expect(h.events.onFailure).not.toHaveBeenCalled();

    h.show();
    expect(h.recognition.running).toBe(true);
  });

  it("si termina de hablar con la página oculta, escucha al volver", () => {
    const h = setup();
    h.audio.say(["Hola"]);
    vi.advanceTimersByTime(0);

    h.hide();
    h.voice.finish();
    vi.advanceTimersByTime(ITEM_PAUSE_MS);
    expect(h.recognition.starts).toBe(0);

    h.show();
    expect(h.recognition.starts).toBe(1);
  });
});

describe("voz bloqueada", () => {
  // Chrome no deja hablar a una página que nadie tocó, como al recargarse sola
  // al volver a la app: sin esto quedaba un asistente mudo y escuchando.
  it("si el navegador no deja hablar, se pausa con voz-bloqueada y no abre el micrófono", () => {
    const h = setup();
    h.audio.say(["Hola", "Otra"]);
    vi.advanceTimersByTime(0);

    h.voice.reject("not-allowed");

    expect(h.events.onFailure).toHaveBeenCalledWith("voz-bloqueada");
    vi.advanceTimersByTime(60_000);
    expect(h.voice.spoken).toEqual(["Hola"]);
    expect(h.recognition.starts).toBe(0);
  });
});

describe("apagado", () => {
  // Es el apagado al completar el checklist: el hook pasa su `stop` como onDone.
  it("si onDone lo apaga, no vuelve a abrir el micrófono", () => {
    const h = setup();
    h.audio.say(["Acabaste todo. Si no tienes novedades, finaliza la tarea."], () =>
      h.audio.shutdown(),
    );
    vi.advanceTimersByTime(0);

    h.voice.finish();
    vi.advanceTimersByTime(ITEM_PAUSE_MS + 60_000);

    expect(h.recognition.starts).toBe(0);
    expect(h.audio.speaking()).toBe(false);
  });

  it("shutdown aborta, cancela la voz y deja sin efecto todo lo pendiente", () => {
    const h = setup();
    startListening(h);
    h.audio.say(["Uno", "Dos"]);
    vi.advanceTimersByTime(50 + AUDIO_SETTLE_MS);
    expect(h.voice.spoken).toEqual([FIRST, "Uno"]);

    h.audio.shutdown();

    expect(h.voice.output.cancel).toHaveBeenCalled();
    h.audio.say(["Tres"]);
    vi.advanceTimersByTime(60_000);
    expect(h.voice.spoken).toEqual([FIRST, "Uno"]);
    expect(h.recognition.starts).toBe(1);
  });

  it("al volver a encenderlo tras una pausa, empieza de cero", () => {
    const h = setup();
    startListening(h);
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      h.recognition.end("network");
      waitForStart(h);
    }
    expect(h.events.onFailure).toHaveBeenCalledWith("sin-conexion");

    h.audio.activate();
    h.audio.say(["Hola"]);
    vi.advanceTimersByTime(0);
    h.voice.finish();
    vi.advanceTimersByTime(ITEM_PAUSE_MS);
    h.recognition.end("network");

    expect(waitForStart(h)).toBe(REARM_DELAYS_MS[0]);
  });
});

describe("afterSession", () => {
  it("una sesión que oyó algo no es un corte, aunque haya sido breve", () => {
    expect(afterSession(3, { heard: true, durationMs: 200, error: null })).toEqual({
      action: "reabrir",
      delayMs: REARM_DELAYS_MS[0],
      failures: 0,
    });
  });

  it("una sesión larga en silencio no es un corte", () => {
    expect(
      afterSession(2, { heard: false, durationMs: 8000, error: "no-speech" }),
    ).toEqual({ action: "reabrir", delayMs: REARM_DELAYS_MS[0], failures: 0 });
  });

  it("los cortes sin un error claro nunca pausan", () => {
    expect(afterSession(50, { heard: false, durationMs: 100, error: null })).toEqual({
      action: "reabrir",
      delayMs: REARM_DELAYS_MS[REARM_DELAYS_MS.length - 1],
      failures: 51,
    });
  });

  it("un error de red cuenta como corte aunque la sesión haya sido larga", () => {
    expect(
      afterSession(0, { heard: false, durationMs: 5000, error: "network" }),
    ).toMatchObject({ action: "reabrir", failures: 1 });
  });

  it("el idioma no soportado pausa en el acto con sin-soporte", () => {
    expect(
      afterSession(0, {
        heard: false,
        durationMs: 100,
        error: "language-not-supported",
      }),
    ).toEqual({ action: "pausar", failure: "sin-soporte" });
  });
});

describe("pickSpanishVoice", () => {
  const voice = (lang: string, localService = true) => ({
    name: `Voz ${lang}`,
    lang,
    localService,
  });

  it("prefiere español de España", () => {
    expect(
      pickSpanishVoice([voice("en-US"), voice("es-US"), voice("es-ES")])?.lang,
    ).toBe("es-ES");
  });

  it("si no hay de España, cualquier otra en español", () => {
    expect(pickSpanishVoice([voice("en-US"), voice("es-MX")])?.lang).toBe("es-MX");
  });

  it("dentro del mismo idioma, la instalada antes que la de red", () => {
    const red = voice("es-ES", false);
    const instalada = voice("es-ES", true);

    expect(pickSpanishVoice([red, instalada])).toBe(instalada);
    expect(pickSpanishVoice([voice("es-US", false), voice("es-MX", true)])?.lang).toBe(
      "es-MX",
    );
  });

  it("acepta el idioma con guion bajo, como lo dan algunos Android", () => {
    expect(pickSpanishVoice([voice("es_US"), voice("es_ES")])?.lang).toBe("es_ES");
  });

  it("sin ninguna voz en español devuelve null", () => {
    expect(pickSpanishVoice([voice("en-US"), voice("pt-BR")])).toBeNull();
    expect(pickSpanishVoice([])).toBeNull();
  });
});
