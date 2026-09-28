import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSectionComplete,
  type ChecklistSection,
} from "@/modules/incidentes/utils/cleaningChecklistUtils";
import { reminderDelayMs } from "@/modules/incidentes/utils/voiceReminder";
import {
  hasWakeWord,
  recognizeCommand,
  type VoiceIntent,
} from "@/modules/incidentes/utils/voiceCommands";

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

type SpeechRecognitionLike = {
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

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const getRecognitionCtor = (): SpeechRecognitionCtor | null => {
  const target = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
};

/** Lo que el operario ve que está pasando. */
export type VoicePhase = "apagado" | "hablando" | "escuchando" | "listo";

export type VoiceFailure = "sin-soporte" | "sin-microfono";

type Params = {
  sections: ChecklistSection[];
  progress: Record<number, boolean>;
  /** Marca el bloque entero. Es el mismo camino que usa el toque. */
  onSectionComplete: (section: ChecklistSection) => void;
};

/**
 * El ticket pide "No olvides decir acabado". Se dice la fórmula completa a
 * propósito: un recordatorio que enseña mal lo que hay que decir deja al
 * operario repitiendo una palabra que no tiene efecto.
 */
const REMINDER_TEXT =
  "No olvides decir: asistente, acabado, si ya terminaste la actividad.";
/** Silencio entre actividad y actividad al leerlas: de corrido no se siguen. */
const ITEM_PAUSE_MS = 450;
/**
 * Cuánto dura la activación. Si el operario dice "asistente" y hace una pausa
 * antes de "acabado", el reconocedor parte las dos palabras en segmentos
 * distintos y ninguno coincide por separado: la ventana es lo que hace que el
 * segundo paso siga contando.
 */
const WAKE_WINDOW_MS = 8000;
/** Si el navegador no avisa que terminó de hablar, se sigue igual. */
const SPEECH_FALLBACK_MS = 10_000;
const REARM_DELAY_MS = 300;

export const useVoiceChecklist = ({
  sections,
  progress,
  onSectionComplete,
}: Params) => {
  const [supported] = useState(
    () =>
      getRecognitionCtor() !== null &&
      typeof window.speechSynthesis !== "undefined",
  );
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("apagado");
  const [saying, setSaying] = useState("");
  const [lastHeard, setLastHeard] = useState("");
  /** Solo para que el control lo muestre: la decisión la toma `wakeUntilRef`. */
  const [awake, setAwake] = useState(false);
  /** Qué está esperando oír, para que el control muestre la fórmula correcta. */
  const [waitingFor, setWaitingFor] = useState<"si-no" | "fin" | null>(null);
  const [failure, setFailure] = useState<VoiceFailure | null>(
    getRecognitionCtor() === null ? "sin-soporte" : null,
  );

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  /** Qué intenciones tienen efecto ahora. Fuera de esta lista, todo se ignora. */
  const expectedRef = useRef<VoiceIntent[]>([]);
  /** El bloque por el que ya se preguntó, para no repetir el anuncio. */
  const announcedRef = useRef<number | null>(null);
  const rearmTimerRef = useRef<number | null>(null);
  /** Hasta cuándo vale la activación. 0 = hay que volver a decir "asistente". */
  const wakeUntilRef = useRef(0);
  const wakeTimerRef = useRef<number | null>(null);
  const reminderTimerRef = useRef<number | null>(null);
  /** Cuántas veces ya se avisó en ESTE bloque: decide si toca el primero o la insistencia. */
  const reminderCountRef = useRef(0);
  const handleTranscriptRef = useRef<(text: string) => void>(() => {});

  /**
   * El bloque en curso es SIEMPRE el primero sin completar, no un índice que
   * lleve el asistente por su cuenta. Gracias a eso, si el operario marca un
   * bloque con el dedo la conversación avanza sola y nunca le vuelve a
   * preguntar por algo que ya dio por hecho: voz y toque son dos entradas al
   * mismo estado, sin nada que sincronizar entre ellas.
   */
  const pendingIndex = sections.findIndex(
    (section) => !isSectionComplete(section, progress),
  );
  const currentSection = pendingIndex >= 0 ? sections[pendingIndex] : null;

  const clearRearm = useCallback(() => {
    if (rearmTimerRef.current !== null) {
      window.clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
  }, []);

  /**
   * La ref es la que decide (los callbacks del reconocedor la leen sin pasar por
   * un render); el estado existe solo para pintar. Van siempre juntos.
   */
  const setExpected = useCallback((intents: VoiceIntent[]) => {
    expectedRef.current = intents;
    setWaitingFor(
      intents.includes("FIN") ? "fin" : intents.length > 0 ? "si-no" : null,
    );
  }, []);

  const clearReminder = useCallback(() => {
    if (reminderTimerRef.current !== null) {
      window.clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    }
    reminderCountRef.current = 0;
  }, []);

  const closeWakeWindow = useCallback(() => {
    wakeUntilRef.current = 0;
    if (wakeTimerRef.current !== null) {
      window.clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
    }
    setAwake(false);
  }, []);

  /**
   * Abre la ventana tras oír "asistente". El temporizador existe solo para que
   * el control deje de decir "te escucho" cuando ya no es cierto: quien decide
   * si un comando vale es `wakeUntilRef`, comparando contra el reloj.
   */
  const openWakeWindow = useCallback(() => {
    wakeUntilRef.current = Date.now() + WAKE_WINDOW_MS;
    if (wakeTimerRef.current !== null) window.clearTimeout(wakeTimerRef.current);
    setAwake(true);
    wakeTimerRef.current = window.setTimeout(() => {
      wakeTimerRef.current = null;
      wakeUntilRef.current = 0;
      setAwake(false);
    }, WAKE_WINDOW_MS);
  }, []);

  const stopRecognition = useCallback(() => {
    clearRearm();
    try {
      recognitionRef.current?.stop();
    } catch {
      // Detener algo que ya estaba detenido no importa.
    }
  }, [clearRearm]);

  const startRecognition = useCallback(() => {
    /** `false` solo si el navegador rechazó el arranque. */
    const attempt = (): boolean => {
      if (!activeRef.current || speakingRef.current) return true;
      try {
        recognitionRef.current?.start();
        setPhase("escuchando");
        return true;
      } catch {
        // `start()` sobre una instancia que todavía no cerró tira
        // InvalidStateError. Es esperable en el rearme rápido.
        return false;
      }
    };

    if (attempt()) return;

    clearRearm();
    rearmTimerRef.current = window.setTimeout(() => {
      rearmTimerRef.current = null;
      // Un solo reintento: si tampoco ahora, lo levanta el `onend` del
      // reconocedor, que siempre acaba disparándose.
      attempt();
    }, REARM_DELAY_MS * 2);
  }, [clearRearm]);

  /**
   * Dice una o varias frases, con una pausa entre ellas, y recién al terminar
   * vuelve a escuchar.
   *
   * El micrófono se apaga mientras habla y eso no es una optimización: varias
   * frases del propio asistente contienen la palabra "acabado", y si el
   * teléfono se oyera a sí mismo daría el bloque por terminado solo.
   */
  const say = useCallback(
    (texts: string[], onDone?: () => void) => {
      if (texts.length === 0) {
        onDone?.();
        return;
      }

      speakingRef.current = true;
      setPhase("hablando");
      stopRecognition();
      window.speechSynthesis.cancel();

      function next(index: number) {
        if (!activeRef.current) {
          speakingRef.current = false;
          setSaying("");
          return;
        }

        if (index >= texts.length) {
          speakingRef.current = false;
          setSaying("");
          onDone?.();
          startRecognition();
          return;
        }

        setSaying(texts[index]);

        const utterance = new SpeechSynthesisUtterance(texts[index]);
        utterance.lang = "es-ES";

        let advanced = false;
        const advance = () => {
          if (advanced) return;
          advanced = true;
          window.setTimeout(() => next(index + 1), ITEM_PAUSE_MS);
        };

        utterance.onend = advance;
        utterance.onerror = advance;
        // Algunos navegadores no disparan ningún evento al terminar; sin este
        // respaldo el asistente se queda mudo y sordo para siempre.
        window.setTimeout(advance, SPEECH_FALLBACK_MS);

        window.speechSynthesis.speak(utterance);
      }

      next(0);
    },
    [startRecognition, stopRecognition],
  );

  /**
   * Arranca el reloj del bloque: avisa al pasarse de sus minutos y después
   * insiste cada dos, hasta que el bloque se marque.
   *
   * Se llama cuando el asistente le pasa el control al operario, no cuando
   * anuncia el bloque: así los minutos de la plantilla significan lo que dicen.
   */
  const scheduleReminder = useCallback(
    (section: ChecklistSection) => {
      clearReminder();

      function schedule() {
        const delay = reminderDelayMs(
          section.totalMinutes,
          reminderCountRef.current,
        );
        // Un bloque sin minutos no avisa nunca: no hay contra qué comparar.
        if (delay === null) return;

        reminderTimerRef.current = window.setTimeout(() => {
          reminderTimerRef.current = null;
          reminderCountRef.current += 1;

          // Si alguna guarda lo bloquea, este turno se salta y se espera al
          // siguiente. No se encola: un recordatorio atrasado ya no sirve.
          const puedeHablar =
            activeRef.current &&
            // Cortaría la lectura de actividades por la mitad.
            !speakingRef.current &&
            // El operario acaba de decir "asistente" y está por decir el
            // comando: hablar apaga el micrófono y se lo comería.
            Date.now() >= wakeUntilRef.current;

          if (puedeHablar) say([REMINDER_TEXT]);

          schedule();
        }, delay);
      }

      schedule();
    },
    [clearReminder, say],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    speakingRef.current = false;
    setExpected([]);
    announcedRef.current = null;
    setActive(false);
    setPhase("apagado");
    setSaying("");
    closeWakeWindow();
    clearReminder();
    stopRecognition();
    try {
      recognitionRef.current?.abort();
    } catch {
      // Ya estaba cerrada.
    }
    window.speechSynthesis?.cancel();
  }, [clearReminder, closeWakeWindow, setExpected, stopRecognition]);

  // Se guarda en una ref porque los callbacks del reconocedor se registran una
  // sola vez, al crear la instancia, y necesitan la versión de ahora.
  useEffect(() => {
    handleTranscriptRef.current = (text: string) => {
      if (speakingRef.current || !activeRef.current) return;

      const esperandoFin = expectedRef.current.includes("FIN");
      const ventanaAbierta = Date.now() < wakeUntilRef.current;

      // Solo terminar una actividad exige activación: es lo único irreversible.
      // El sí/no vive unos segundos tras una pregunta directa y equivocarse ahí
      // no da trabajo por hecho.
      const intent = recognizeCommand(text, expectedRef.current, {
        requireWake: esperandoFin && !ventanaAbierta,
      });

      if (!intent) {
        // "asistente" a secas: se confirma en voz alta y se abre la ventana, que
        // es lo que permite decir la segunda palabra después de una pausa.
        if (esperandoFin && !ventanaAbierta && hasWakeWord(text)) {
          setLastHeard(text.trim());
          setExpected([]);
          say(["Dime."], () => {
            // La ventana arranca al TERMINAR de hablar: si se abriera antes, el
            // propio "Dime" se comería un segundo de los ocho.
            openWakeWindow();
            setExpected(["FIN"]);
          });
        }
        return;
      }

      setLastHeard(text.trim());
      // Mientras se procesa lo que se acaba de oír no se escucha nada más: sin
      // esto, un segundo parcial del mismo dictado vuelve a entrar.
      setExpected([]);

      if (intent === "AFIRMACION") {
        say(["Adelante. Cuando termines, di: asistente, acabado."], () => {
          setExpected(["FIN"]);
          if (currentSection) scheduleReminder(currentSection);
        });
        return;
      }

      if (intent === "NEGACION" && currentSection) {
        say(
          [
            ...currentSection.items.map((item) => item.text),
            "Bien. Cuando termines, di: asistente, acabado.",
          ],
          () => {
            setExpected(["FIN"]);
            scheduleReminder(currentSection);
          },
        );
        return;
      }

      if (intent === "FIN" && currentSection) {
        closeWakeWindow();
        // El siguiente bloque NO se anuncia desde acá: al marcarlo cambia el
        // progreso, y de eso se encarga el efecto de abajo. Así da igual si el
        // bloque se completó hablando o con el dedo.
        onSectionComplete(currentSection);
      }
    };
  });

  const start = useCallback(() => {
    if (!supported || activeRef.current) return;

    if (!recognitionRef.current) {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return;

      const recognition = new Ctor();
      recognition.lang = "es-ES";
      // `continuous: true` porque con `false` se pierde más de la mitad de lo
      // que el reconocedor entiende: cierra la sesión antes de cerrar la
      // transcripción y descarta lo oído. Medido en la prueba de campo.
      recognition.continuous = true;
      // Se actúa sobre los parciales: el resultado final llega tarde o no llega.
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        handleTranscriptRef.current(result[0]?.transcript ?? "");
      };

      recognition.onerror = (event) => {
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          setFailure("sin-microfono");
          stop();
        }
      };

      recognition.onend = () => {
        if (!activeRef.current || speakingRef.current) return;
        clearRearm();
        rearmTimerRef.current = window.setTimeout(() => {
          rearmTimerRef.current = null;
          startRecognition();
        }, REARM_DELAY_MS);
      };

      recognitionRef.current = recognition;
    }

    activeRef.current = true;
    announcedRef.current = null;
    setActive(true);
    setFailure(null);
  }, [clearRearm, startRecognition, stop, supported]);

  /**
   * El motor de la conversación: cada vez que cambia cuál es el primer bloque
   * sin completar, se anuncia ese. Vale igual si el cambio vino de un "acabado"
   * o de un toque en pantalla.
   */
  useEffect(() => {
    if (!active) return;
    if (announcedRef.current === pendingIndex) return;

    // Se difiere un tick: hablar es una acción sobre un sistema externo, no una
    // sincronización de estado, y lanzarla dentro del commit encadena renders.
    // `announcedRef` se marca acá adentro y no afuera para que, si el efecto se
    // vuelve a disparar antes de que corra, el anuncio no se pierda.
    const timer = window.setTimeout(() => {
      if (!activeRef.current) return;

      announcedRef.current = pendingIndex;
      setExpected([]);
      // El bloque anterior ya no corre: sus avisos no tienen a quién recordarle.
      clearReminder();

      if (pendingIndex === -1) {
        say(["Acabaste todo. Si no tienes novedades, finaliza la tarea."], () =>
          setPhase("listo"),
        );
        return;
      }

      const section = sections[pendingIndex];
      say(
        [`¿Te acuerdas de los elementos de: ${section.title ?? "esta sección"}?`],
        () => {
          setExpected(["AFIRMACION", "NEGACION"]);
        },
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [active, clearReminder, pendingIndex, say, sections, setExpected]);

  // Al salir de la pantalla hay que soltar el micrófono: si no, el navegador
  // sigue mostrando el indicador de grabación sobre una pantalla que ya no está.
  useEffect(() => () => stop(), [stop]);

  return {
    supported,
    active,
    phase,
    saying,
    lastHeard,
    awake,
    waitingFor,
    failure,
    currentTitle: currentSection?.title ?? null,
    start,
    stop,
  };
};
