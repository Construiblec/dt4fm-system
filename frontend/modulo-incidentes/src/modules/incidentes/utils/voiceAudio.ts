/**
 * El micrófono y la voz del asistente, sin nada de la conversación.
 *
 * Lo que falló en el campo fue de orden y de tiempos, no de qué decir: hablar
 * con el micrófono todavía abierto, pedir una frase justo después de cancelar
 * otra, reabrir la escucha en bucle ante un error de red. Por eso esta parte
 * vive aparte del hook y recibe el navegador como dependencias: con un
 * reconocedor y una voz falsos y el reloj de Vitest se prueba sin jsdom.
 */

// ── Tipos mínimos de la Web Speech API ──────────────────────────────────────
// No están en lib.dom de forma portable: en Safari el constructor sigue siendo
// `webkitSpeechRecognition`. Se declara solo lo que se usa.

type SpeechAlternative = { transcript: string };
type SpeechResult = {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
};
type SpeechResultList = { readonly length: number; [index: number]: SpeechResult };
type SpeechResultEvent = { results: SpeechResultList };
type SpeechErrorEvent = { error: string };

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};

/**
 * Por qué el asistente se apagó solo. Cada motivo tiene su aviso en pantalla
 * (`VoiceChecklistControl`):
 *
 * - `sin-soporte`: el navegador no reconoce voz, o no en español.
 * - `sin-microfono`: el operario o el sistema negaron el micrófono.
 * - `sin-conexion`: el reconocimiento de Chrome necesita internet y no lo hay.
 * - `microfono-no-disponible`: el micrófono no da audio; suele ser otra app
 *   usándolo.
 * - `voz-bloqueada`: el navegador no deja hablar hasta que se toque la pantalla.
 */
export type VoiceFailure =
  | "sin-soporte"
  | "sin-microfono"
  | "sin-conexion"
  | "microfono-no-disponible"
  | "voz-bloqueada";

/** La voz del teléfono. El hook le pasa la del navegador; los tests, una falsa. */
export type VoiceOutput = {
  /** Hay una frase sonando o esperando turno. */
  busy: () => boolean;
  cancel: () => void;
  /** Dice `text` y avisa al terminar, o al fallar con el código del navegador. */
  speak: (
    text: string,
    onEnd: () => void,
    onError: (error: string) => void,
  ) => void;
};

export type VoiceAudioDeps = {
  createRecognition: () => SpeechRecognitionLike;
  output: VoiceOutput;
  isHidden: () => boolean;
  /** Avisa cada vez que la página vuelve a verse. Devuelve cómo dejar de avisar. */
  onVisible: (listener: () => void) => () => void;
};

export type VoiceAudioEvents = {
  /** Lo que se oyó, parciales incluidos. Nunca llega mientras habla. */
  onTranscript: (text: string) => void;
  onPhase: (phase: "hablando" | "escuchando") => void;
  /** La frase que suena ahora; vacía al terminar. */
  onSaying: (text: string) => void;
  /** Se dejó de intentar. Cuando llega, el audio ya quedó apagado. */
  onFailure: (failure: VoiceFailure) => void;
};

/** Silencio entre frase y frase: de corrido no se siguen. */
export const ITEM_PAUSE_MS = 450;
/**
 * Cuánto se espera a que el reconocimiento avise que soltó el micrófono antes
 * de hablar. En Android, una voz que arranca con el micrófono todavía abierto
 * puede salir muda. Si el aviso no llega, se habla igual.
 */
export const MIC_RELEASE_MAX_MS = 400;
/**
 * Respiro entre soltar el audio (el micrófono, o una frase cancelada) y hablar:
 * Chrome a veces descarta la frase pedida justo después de un `cancel()`.
 */
export const AUDIO_SETTLE_MS = 250;
/** Cada cuánto se mira si la voz sigue sonando cuando ya se cumplió el respaldo. */
export const STILL_SPEAKING_POLL_MS = 500;
const SPEECH_FALLBACK_BASE_MS = 3000;
/** Holgado: una voz en español dice unos 14 caracteres por segundo. */
const SPEECH_FALLBACK_PER_CHAR_MS = 90;
/**
 * Esperas antes de reabrir el micrófono. La primera es también la de un
 * silencio normal; las siguientes, la de cortes rápidos seguidos.
 */
export const REARM_DELAYS_MS = [300, 1000, 3000];
/** Una sesión más corta que esto que no oyó nada no llegó a escuchar: es un corte. */
export const QUICK_SESSION_MS = 1500;
/** Cortes seguidos con un error claro antes de pausar y avisar. */
export const MAX_FAILURES = 4;

type VoiceInfo = { lang: string; localService: boolean };

/** `es_ES` → `es-es`: algunos Android dan el idioma con guion bajo. */
const langTag = (lang: string) => lang.replace("_", "-").toLowerCase();

/**
 * La voz con que habla el asistente: de España si la hay, si no cualquier otra
 * en español, y en cada caso la instalada antes que la de red (la de red
 * necesita conexión, y en Chrome de escritorio corta las frases largas).
 *
 * Pedir `es-ES` sin elegir voz falla en silencio en los móviles cuyo motor no
 * la tiene instalada, como algunos Samsung con su motor propio.
 */
export const pickSpanishVoice = <V extends VoiceInfo>(
  voices: readonly V[],
): V | null => {
  const rank = (voice: V) =>
    (langTag(voice.lang) === "es-es" ? 0 : 2) + (voice.localService ? 0 : 1);

  return (
    voices
      .filter((voice) => /^es(-|$)/.test(langTag(voice.lang)))
      .sort((a, b) => rank(a) - rank(b))[0] ?? null
  );
};

/**
 * Cuánto se espera el aviso de que una frase terminó antes de darla por dicha.
 *
 * Crece con la frase. Con un respaldo fijo de 10 s, una actividad larga se daba
 * por dicha a media lectura y el micrófono se abría con el teléfono hablando, y
 * casi todas las frases dicen "asistente, acabado".
 */
export const speechFallbackMs = (text: string): number =>
  SPEECH_FALLBACK_BASE_MS + text.length * SPEECH_FALLBACK_PER_CHAR_MS;

/** Cómo terminó una sesión de escucha. */
export type SessionEnd = {
  /** Si oyó algo, aunque sea un parcial. */
  heard: boolean;
  /** Desde `start()` hasta `onend`. */
  durationMs: number;
  /** El error que avisó el navegador en esa sesión, si hubo. */
  error: string | null;
};

export type AfterSession =
  | { action: "reabrir"; delayMs: number; failures: number }
  | { action: "pausar"; failure: VoiceFailure };

/** Errores que reintentar no arregla: se avisa ya. */
const FATAL_ERRORS: Partial<Record<string, VoiceFailure>> = {
  "not-allowed": "sin-microfono",
  "service-not-allowed": "sin-microfono",
  "language-not-supported": "sin-soporte",
};

/** Errores que se pueden pasar solos: vuelve la señal, la otra app suelta el micrófono. */
const PERSISTENT_ERRORS: Partial<Record<string, VoiceFailure>> = {
  network: "sin-conexion",
  "audio-capture": "microfono-no-disponible",
};

/**
 * Qué hacer al terminar una sesión de escucha, con `failures` cortes seguidos
 * antes de ella.
 *
 * Android cierra la escucha tras unos segundos de silencio aunque se pida
 * continua. Eso es normal y se reabre enseguida: si no, el operario hablaría
 * sobre un micrófono cerrado. Lo que no es normal es que se corte en el acto, y
 * reabrir siempre a los 300 ms era el bucle de pitidos. Los cortes seguidos se
 * espacian, y si traen un error claro se pausa y se avisa.
 */
export const afterSession = (
  failures: number,
  end: SessionEnd,
): AfterSession => {
  const fatal = end.error ? FATAL_ERRORS[end.error] : undefined;
  if (fatal) return { action: "pausar", failure: fatal };

  const persistent = end.error ? PERSISTENT_ERRORS[end.error] : undefined;
  const cut =
    !end.heard &&
    (persistent !== undefined || end.durationMs < QUICK_SESSION_MS);
  const streak = cut ? failures + 1 : 0;

  // Los cortes sin un error claro solo se espacian: pausar por ellos podría
  // dejar sin asistente a un móvil que simplemente cierra rápido.
  if (persistent && streak >= MAX_FAILURES) {
    return { action: "pausar", failure: persistent };
  }

  const step = Math.min(Math.max(streak - 1, 0), REARM_DELAYS_MS.length - 1);
  return { action: "reabrir", delayMs: REARM_DELAYS_MS[step], failures: streak };
};

type Timer = ReturnType<typeof setTimeout>;

export type VoiceAudio = ReturnType<typeof createVoiceAudio>;

export const createVoiceAudio = (
  deps: VoiceAudioDeps,
  events: VoiceAudioEvents,
) => {
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;
  let speaking = false;
  let listening = false;
  /**
   * Cada `say` abre un turno. Lo que quede pendiente de uno anterior (el aviso
   * de una frase cancelada, un temporizador) mira esto y no hace nada: sin
   * turnos, tocar un bloque mientras hablaba dejaba viva la lectura vieja, que
   * seguía hablando y reabría el micrófono en mitad de la nueva.
   */
  let turn = 0;
  let failures = 0;
  let heard = false;
  let lastError: string | null = null;
  let startedAt = 0;
  /** La escucha quedó pendiente de que la página vuelva a verse. */
  let waitingVisible = false;
  let rearmTimer: Timer | null = null;
  /** Lo que espera a que el reconocimiento avise que soltó el micrófono. */
  let releaseWaiters: Array<() => void> = [];
  let stopWatchingVisibility: (() => void) | null = null;
  const timers = new Set<Timer>();

  const later = (ms: number, run: () => void): Timer => {
    const id = setTimeout(() => {
      timers.delete(id);
      run();
    }, ms);
    timers.add(id);
    return id;
  };

  const clearRearm = () => {
    if (rearmTimer === null) return;
    clearTimeout(rearmTimer);
    timers.delete(rearmTimer);
    rearmTimer = null;
  };

  const shutdown = () => {
    active = false;
    speaking = false;
    listening = false;
    waitingVisible = false;
    turn += 1;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    rearmTimer = null;
    releaseWaiters = [];
    stopWatchingVisibility?.();
    stopWatchingVisibility = null;
    try {
      recognition?.abort();
    } catch {
      // Ya estaba cerrada.
    }
    if (deps.output.busy()) deps.output.cancel();
  };

  const fail = (failure: VoiceFailure) => {
    shutdown();
    events.onFailure(failure);
  };

  const scheduleAfter = (end: SessionEnd) => {
    const next = afterSession(failures, end);

    if (next.action === "pausar") {
      fail(next.failure);
      return;
    }

    failures = next.failures;
    clearRearm();
    rearmTimer = later(next.delayMs, () => {
      rearmTimer = null;
      listen();
    });
  };

  function listen() {
    if (!active || speaking || listening || !recognition) return;
    clearRearm();
    // Ya es su turno de escuchar, aunque el micrófono se abra un poco después.
    events.onPhase("escuchando");

    if (deps.isHidden()) {
      waitingVisible = true;
      return;
    }

    heard = false;
    lastError = null;
    startedAt = Date.now();

    try {
      recognition.start();
      listening = true;
    } catch {
      // `start()` sobre una sesión que todavía no terminó de cerrarse tira
      // InvalidStateError. Cuenta como un corte: si se repite, se espacia.
      scheduleAfter({ heard: false, durationMs: 0, error: null });
    }
  }

  const handleEnd = () => {
    listening = false;
    const waiters = releaseWaiters;
    releaseWaiters = [];
    waiters.forEach((release) => release());

    // Cerrada a propósito, para hablar o al apagar: no hay nada que decidir.
    if (!active || speaking) return;

    // Con la pantalla apagada o en otra app, el navegador corta la escucha. No
    // es un fallo, y reintentar ahí solo acumularía cortes: sigue al volver.
    if (deps.isHidden()) {
      waitingVisible = true;
      return;
    }

    scheduleAfter({
      heard,
      durationMs: Date.now() - startedAt,
      error: lastError,
    });
  };

  /** Suelta el micrófono y sigue cuando el reconocimiento avisa, o a los 400 ms. */
  const releaseMic = (then: () => void) => {
    clearRearm();

    if (!listening || !recognition) {
      then();
      return;
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      then();
    };

    releaseWaiters.push(release);
    later(MIC_RELEASE_MAX_MS, () => {
      // Sin aviso se da por cerrado: si no, no se volvería a escuchar nunca.
      if (!released) listening = false;
      release();
    });

    try {
      // `abort()` y no `stop()`: cierra en el acto, y lo que estuviera por
      // llegar se iba a ignorar igual porque el asistente va a hablar.
      recognition.abort();
    } catch {
      listening = false;
      release();
    }
  };

  /**
   * Dice las frases, con una pausa entre ellas, y al terminar vuelve a
   * escuchar.
   *
   * Antes de la primera: suelta el micrófono, cancela lo que suene (solo si
   * suena algo) y, si hizo alguna de las dos cosas, respira. `onDone` corre al
   * terminar la última y antes de reabrir el micrófono; si apaga el asistente o
   * pide otra frase, no se reabre.
   */
  const say = (texts: string[], onDone?: () => void) => {
    if (!active) return;

    if (texts.length === 0) {
      onDone?.();
      return;
    }

    turn += 1;
    const myTurn = turn;
    speaking = true;
    events.onPhase("hablando");

    const wasListening = listening;
    releaseMic(() => {
      if (myTurn !== turn) return;

      // Un `cancel()` de más llega tarde al motor y se lleva la frase que se
      // pide a continuación: solo si de verdad suena algo.
      const interrupted = deps.output.busy();
      if (interrupted) deps.output.cancel();

      later(wasListening || interrupted ? AUDIO_SETTLE_MS : 0, () =>
        sayFrom(0),
      );
    });

    function sayFrom(index: number) {
      if (myTurn !== turn) return;

      if (index >= texts.length) {
        speaking = false;
        events.onSaying("");
        onDone?.();
        if (myTurn === turn) listen();
        return;
      }

      const text = texts[index];
      events.onSaying(text);

      let advanced = false;
      const advance = () => {
        if (advanced || myTurn !== turn) return;
        advanced = true;
        later(ITEM_PAUSE_MS, () => sayFrom(index + 1));
      };

      // Algunos navegadores no avisan que la frase terminó. Se espera lo que
      // tarda en decirse y, si sigue sonando, un poco más: abrir el micrófono
      // con el teléfono hablando es oírse a sí mismo decir "acabado".
      const limit = Date.now() + 2 * speechFallbackMs(text);
      const fallback = () => {
        if (advanced || myTurn !== turn) return;
        if (deps.output.busy() && Date.now() < limit) {
          later(STILL_SPEAKING_POLL_MS, fallback);
          return;
        }
        advance();
      };
      later(speechFallbackMs(text), fallback);

      deps.output.speak(text, advance, (error) => {
        if (myTurn !== turn) return;

        // Chrome no deja hablar a una página que nadie tocó todavía, como
        // cuando se recarga sola al volver a la app. Seguir sería un asistente
        // mudo con el micrófono abierto: se pausa, y un toque lo arregla.
        if (error === "not-allowed") {
          fail("voz-bloqueada");
          return;
        }

        advance();
      });
    }
  };

  const activate = () => {
    if (active) return;

    if (!recognition) {
      recognition = deps.createRecognition();
      recognition.lang = "es-ES";
      // `continuous: true` porque con `false` se pierde más de la mitad de lo
      // que el reconocedor entiende: cierra la sesión antes de cerrar la
      // transcripción y descarta lo oído. Medido en la prueba de campo.
      recognition.continuous = true;
      // Se actúa sobre los parciales: el resultado final llega tarde o no llega.
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        heard = true;
        failures = 0;
        if (!active || speaking) return;
        const result = event.results[event.results.length - 1];
        events.onTranscript(result?.[0]?.transcript ?? "");
      };
      // El error llega justo antes de `onend`, que es donde se decide.
      recognition.onerror = (event) => {
        lastError = event.error;
      };
      recognition.onend = handleEnd;
    }

    active = true;
    failures = 0;
    waitingVisible = false;
    stopWatchingVisibility = deps.onVisible(() => {
      if (!waitingVisible) return;
      waitingVisible = false;
      failures = 0;
      listen();
    });
  };

  return {
    activate,
    say,
    shutdown,
    /** Habla, o está por hablar: mientras tanto no se escucha. */
    speaking: () => speaking,
  };
};
