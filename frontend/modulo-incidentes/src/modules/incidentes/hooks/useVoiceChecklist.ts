import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChecklistActivity,
  ChecklistSection,
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

/**
 * Con qué granularidad se trabaja el bloque en curso. Lo fija la respuesta a
 * "¿te acuerdas de los elementos?" y se reinicia en cada bloque.
 */
type BlockMode = "bloque" | "actividad";

type Params = {
  sections: ChecklistSection[];
  progress: Record<number, boolean>;
  /** Marca el bloque entero. Mismo camino que el toque en pantalla. */
  onSectionComplete: (section: ChecklistSection) => void;
  /** Marca una sola actividad, que es para lo que existe el estado oculto. */
  onActivityComplete: (activity: ChecklistActivity) => void;
};

/** La fórmula, repetida en cada anuncio: a los tres bloques ya nadie la recuerda. */
const COMMAND_HINT = "Di: asistente, acabado cuando finalices.";
/** Silencio entre actividad y actividad al leerlas: de corrido no se siguen. */
const ITEM_PAUSE_MS = 450;
/**
 * Cuánto dura la activación. Si el operario dice "asistente" y hace una pausa
 * antes de "acabado", el reconocedor parte las dos palabras en segmentos
 * distintos: la ventana es lo que hace que el segundo paso siga contando.
 */
const WAKE_WINDOW_MS = 8000;
/** Si el navegador no avisa que terminó de hablar, se sigue igual. */
const SPEECH_FALLBACK_MS = 10_000;
const REARM_DELAY_MS = 300;

/** Lo que se espera oír mientras el operario trabaja. */
const WORKING_INTENTS: VoiceIntent[] = ["FIN", "REPETIR"];
const ANSWER_INTENTS: VoiceIntent[] = ["AFIRMACION", "NEGACION"];

/**
 * Primera actividad sin completar, y el bloque al que pertenece.
 *
 * Todo el asistente se orienta por acá, derivándolo del progreso en vez de
 * llevar un índice propio: si el operario marca con el dedo, lo pendiente cambia
 * solo y la conversación avanza sin nada que sincronizar.
 */
const findPending = (
  sections: ChecklistSection[],
  progress: Record<number, boolean>,
): { sectionIndex: number; itemIndex: number } => {
  for (let s = 0; s < sections.length; s += 1) {
    const items = sections[s].items;
    for (let i = 0; i < items.length; i += 1) {
      if (!progress[items[i].checkableIndex]) {
        return { sectionIndex: s, itemIndex: i };
      }
    }
  }
  return { sectionIndex: -1, itemIndex: -1 };
};

export const useVoiceChecklist = ({
  sections,
  progress,
  onSectionComplete,
  onActivityComplete,
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
  /** Solo para pintar: la decisión la toma `wakeUntilRef`. */
  const [awake, setAwake] = useState(false);
  const [waitingFor, setWaitingFor] = useState<"si-no" | "fin" | null>(null);
  const [failure, setFailure] = useState<VoiceFailure | null>(
    getRecognitionCtor() === null ? "sin-soporte" : null,
  );

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  /** Qué intenciones tienen efecto ahora. Fuera de esta lista, todo se ignora. */
  const expectedRef = useRef<VoiceIntent[]>([]);
  const modeRef = useRef<BlockMode | null>(null);
  const announcedSectionRef = useRef<number | null>(null);
  const announcedItemRef = useRef<number | null>(null);
  const rearmTimerRef = useRef<number | null>(null);
  /** Hasta cuándo vale la activación. 0 = hay que volver a decir "asistente". */
  const wakeUntilRef = useRef(0);
  const wakeTimerRef = useRef<number | null>(null);
  const reminderTimerRef = useRef<number | null>(null);
  /** Cuántas veces ya se avisó de lo mismo: decide primero o insistencia. */
  const reminderCountRef = useRef(0);
  const handleTranscriptRef = useRef<(text: string) => void>(() => {});

  const { sectionIndex, itemIndex } = findPending(sections, progress);
  const currentSection = sectionIndex >= 0 ? sections[sectionIndex] : null;
  const currentActivity =
    currentSection && itemIndex >= 0 ? currentSection.items[itemIndex] : null;

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

  const clearRearm = useCallback(() => {
    if (rearmTimerRef.current !== null) {
      window.clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
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
   * Abre la ventana tras oír "asistente". EN SILENCIO y sin parar el micrófono.
   *
   * Contestar acá era un bug: "asistente, acabado" llega en dos entregas
   * —primero "asistente", después la frase entera—, así que responder a la
   * primera apagaba el micrófono para hablar y se comía el resto del comando.
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
      // Un solo reintento: si tampoco ahora, lo levanta el `onend`.
      attempt();
    }, REARM_DELAY_MS * 2);
  }, [clearRearm]);

  /**
   * Dice una o varias frases, con una pausa entre ellas, y recién al terminar
   * vuelve a escuchar.
   *
   * El micrófono se apaga mientras habla y eso no es una optimización: casi
   * todas las frases del asistente contienen la palabra "acabado", y si el
   * teléfono se oyera a sí mismo se daría el trabajo por hecho solo.
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
   * Arranca el reloj de lo que el operario tiene entre manos: el bloque entero
   * si dijo que se lo acuerda, o la actividad en curso si no.
   *
   * `subject` es lo que el aviso nombra, y es lo que hace viable el silencio del
   * camino "sí": quien se distrajo se reorienta ahí sin mirar el teléfono.
   */
  const scheduleReminder = useCallback(
    (minutes: number | null, subject: string) => {
      clearReminder();

      function schedule() {
        const delay = reminderDelayMs(minutes, reminderCountRef.current);
        // Sin minutos en la plantilla no hay contra qué comparar: no se avisa.
        if (delay === null) return;

        reminderTimerRef.current = window.setTimeout(() => {
          reminderTimerRef.current = null;
          reminderCountRef.current += 1;

          // Si alguna guarda lo bloquea, este turno se salta y se espera al
          // siguiente. No se encola: un aviso atrasado ya no sirve.
          const puedeHablar =
            activeRef.current &&
            // Cortaría la lectura de actividades por la mitad.
            !speakingRef.current &&
            // El operario acaba de decir "asistente" y está por decir el
            // comando: hablar apaga el micrófono y se lo comería.
            Date.now() >= wakeUntilRef.current;

          if (puedeHablar) {
            say([`¿Acabaste? ${subject}. Recuerda decir: asistente, acabado.`]);
          }

          schedule();
        }, delay);
      }

      schedule();
    },
    [clearReminder, say],
  );

  /** Pasa el control al operario sobre UNA actividad y arranca su reloj. */
  const handOverActivity = useCallback(
    (activity: ChecklistActivity, lead?: string) => {
      setExpected([]);
      const frase = lead
        ? `${lead} ${activity.text}. ${COMMAND_HINT}`
        : `${activity.text}. ${COMMAND_HINT}`;

      say([frase], () => {
        setExpected(WORKING_INTENTS);
        scheduleReminder(activity.minutes, `Actividad: ${activity.text}`);
      });
    },
    [say, scheduleReminder, setExpected],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    speakingRef.current = false;
    modeRef.current = null;
    announcedSectionRef.current = null;
    announcedItemRef.current = null;
    setExpected([]);
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

      const esperando = expectedRef.current;
      const necesitaActivacion =
        esperando.includes("FIN") || esperando.includes("REPETIR");
      const ventanaAbierta = Date.now() < wakeUntilRef.current;

      const intent = recognizeCommand(text, esperando, {
        // Terminar y repetir exigen activación porque conviven con el trabajo.
        // El sí/no no: vive unos segundos tras una pregunta directa, y
        // equivocarse ahí no da trabajo por hecho.
        requireWake: necesitaActivacion && !ventanaAbierta,
      });

      if (!intent) {
        // "asistente" a secas abre la ventana y NO contesta nada: contestar
        // apagaría el micrófono y se comería la segunda mitad del comando.
        if (necesitaActivacion && !ventanaAbierta && hasWakeWord(text)) {
          openWakeWindow();
        }
        return;
      }

      setLastHeard(text.trim());
      // Mientras se procesa lo que se acaba de oír no se escucha nada más: sin
      // esto, un segundo parcial del mismo dictado vuelve a entrar.
      setExpected([]);
      closeWakeWindow();

      if (!currentSection || !currentActivity) return;

      if (intent === "AFIRMACION") {
        // Se las acuerda: se trabaja el bloque entero y el teléfono se calla.
        modeRef.current = "bloque";
        say([COMMAND_HINT], () => {
          setExpected(WORKING_INTENTS);
          scheduleReminder(
            currentSection.totalMinutes,
            currentSection.title ?? "este bloque",
          );
        });
        return;
      }

      if (intent === "NEGACION") {
        // No se las acuerda: se le leen y se lo guía de a una.
        modeRef.current = "actividad";
        announcedItemRef.current = itemIndex;
        say(
          currentSection.items.map((item) => item.text),
          () => handOverActivity(currentActivity, "Empezamos con:"),
        );
        return;
      }

      if (intent === "REPETIR") {
        // No cambia la granularidad ya elegida: es un recordatorio de qué hay
        // que hacer, no un cambio de modo.
        say(
          currentSection.items.map((item) => item.text),
          () => handOverActivity(currentActivity, "Vas en:"),
        );
        return;
      }

      if (intent === "FIN") {
        clearReminder();
        if (modeRef.current === "bloque") {
          onSectionComplete(currentSection);
        } else {
          onActivityComplete(currentActivity);
        }
        // Lo que viene lo anuncia el efecto de abajo, al cambiar lo pendiente.
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
    modeRef.current = null;
    announcedSectionRef.current = null;
    announcedItemRef.current = null;
    setActive(true);
    setFailure(null);
  }, [clearRearm, startRecognition, stop, supported]);

  /**
   * El motor de la conversación. Reacciona a que cambie lo pendiente, sin
   * importar si cambió por voz o porque el operario marcó con el dedo.
   */
  useEffect(() => {
    if (!active) return;

    const bloqueNuevo = announcedSectionRef.current !== sectionIndex;
    const actividadNueva = announcedItemRef.current !== itemIndex;
    if (!bloqueNuevo && !actividadNueva) return;

    // Se difiere un tick: hablar es una acción sobre un sistema externo, no una
    // sincronización de estado, y lanzarla dentro del commit encadena renders.
    const timer = window.setTimeout(() => {
      if (!activeRef.current) return;

      const anterior = announcedSectionRef.current;
      announcedSectionRef.current = sectionIndex;
      announcedItemRef.current = itemIndex;

      if (sectionIndex === -1) {
        modeRef.current = null;
        setExpected([]);
        clearReminder();
        say(["Acabaste todo. Si no tienes novedades, finaliza la tarea."], () =>
          setPhase("listo"),
        );
        return;
      }

      const section = sections[sectionIndex];

      if (bloqueNuevo) {
        // Bloque nuevo: vuelve a preguntar, y la respuesta fija la granularidad.
        modeRef.current = null;
        setExpected([]);
        clearReminder();

        const frases: string[] = [];
        if (anterior !== null && anterior >= 0 && anterior !== sectionIndex) {
          frases.push(`${sections[anterior].title ?? "Bloque"} listo.`);
        }
        frases.push(
          `${section.title ?? "Esta sección"}. ¿Te acuerdas de los elementos?`,
        );

        say(frases, () => setExpected(ANSWER_INTENTS));
        return;
      }

      // Mismo bloque, actividad siguiente. Solo se anuncia si el operario pidió
      // que lo guíen: si dijo que se las acuerda, el teléfono se calla.
      if (modeRef.current === "actividad") {
        const activity = section.items[itemIndex];
        if (activity) handOverActivity(activity);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    active,
    clearReminder,
    handOverActivity,
    itemIndex,
    say,
    sectionIndex,
    sections,
    setExpected,
  ]);

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
    currentBlockTitle: currentSection?.title ?? null,
    currentActivityText: currentActivity?.text ?? null,
    start,
    stop,
  };
};
