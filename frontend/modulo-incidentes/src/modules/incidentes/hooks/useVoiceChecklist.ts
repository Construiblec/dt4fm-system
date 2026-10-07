import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChecklistActivity,
  ChecklistSection,
} from "@/modules/incidentes/utils/cleaningChecklistUtils";
import { unlockSpeechSynthesis } from "@/modules/incidentes/utils/speechUnlock";
import {
  createVoiceAudio,
  pickSpanishVoice,
  type SpeechRecognitionLike,
  type VoiceAudio,
  type VoiceAudioDeps,
  type VoiceFailure,
  type VoiceOutput,
} from "@/modules/incidentes/utils/voiceAudio";
import { reminderDelayMs } from "@/modules/incidentes/utils/voiceReminder";
import {
  hasWakeWord,
  recognizeCommand,
  type VoiceIntent,
} from "@/modules/incidentes/utils/voiceCommands";

export type { VoiceFailure } from "@/modules/incidentes/utils/voiceAudio";

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const getRecognitionCtor = (): SpeechRecognitionCtor | null => {
  const target = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
};

/** La voz del navegador, para `createVoiceAudio`. */
const browserVoice = (): VoiceOutput => {
  const synth = window.speechSynthesis;
  // La frase que suena. Sin una referencia, Chrome puede liberarla de memoria a
  // media lectura, y entonces nunca avisa que terminó.
  let current: SpeechSynthesisUtterance | null = null;

  return {
    busy: () => synth.speaking || synth.pending,
    cancel: () => synth.cancel(),
    speak: (text, onEnd, onError) => {
      const utterance = new SpeechSynthesisUtterance(text);
      // Chrome entrega la lista de voces tarde: se mira en cada frase, y la
      // primera puede salir solo con el idioma, como antes.
      const voice = pickSpanishVoice(synth.getVoices());
      utterance.lang = voice ? voice.lang.replace("_", "-") : "es-ES";
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        if (current === utterance) current = null;
        onEnd();
      };
      utterance.onerror = (event) => {
        if (current === utterance) current = null;
        onError(event.error);
      };

      current = utterance;
      synth.speak(utterance);
    },
  };
};

const browserAudio = (Ctor: SpeechRecognitionCtor): VoiceAudioDeps => ({
  createRecognition: () => new Ctor(),
  output: browserVoice(),
  isHidden: () => document.visibilityState === "hidden",
  onVisible: (listener) => {
    const handle = () => {
      if (document.visibilityState === "visible") listener();
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  },
});

/** Lo que el operario ve que está pasando. */
export type VoicePhase = "apagado" | "hablando" | "escuchando";

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
/**
 * Cuánto dura la activación. Si el operario dice "asistente" y hace una pausa
 * antes de "acabado", el reconocedor parte las dos palabras en segmentos
 * distintos: la ventana es lo que hace que el segundo paso siga contando.
 */
const WAKE_WINDOW_MS = 8000;

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

  /** El micrófono y la voz. Se crea al encender la primera vez. */
  const audioRef = useRef<VoiceAudio | null>(null);
  const activeRef = useRef(false);
  /** Qué intenciones tienen efecto ahora. Fuera de esta lista, todo se ignora. */
  const expectedRef = useRef<VoiceIntent[]>([]);
  const modeRef = useRef<BlockMode | null>(null);
  const announcedSectionRef = useRef<number | null>(null);
  const announcedItemRef = useRef<number | null>(null);
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
  /** Todo marcado: el asistente ya no tiene nada que guiar. */
  const complete = sections.length > 0 && sectionIndex === -1;

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

  /**
   * Dice una o varias frases, con una pausa entre ellas, y recién al terminar
   * vuelve a escuchar.
   *
   * El micrófono se apaga mientras habla y eso no es una optimización: casi
   * todas las frases del asistente contienen la palabra "acabado", y si el
   * teléfono se oyera a sí mismo se daría el trabajo por hecho solo. El orden y
   * los tiempos de soltar el micrófono y hablar viven en `voiceAudio`.
   */
  const say = useCallback((texts: string[], onDone?: () => void) => {
    audioRef.current?.say(texts, onDone);
  }, []);

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
            !audioRef.current?.speaking() &&
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
    (activity: ChecklistActivity) => {
      setExpected([]);
      say([`${activity.text}. ${COMMAND_HINT}`], () => {
        setExpected(WORKING_INTENTS);
        scheduleReminder(activity.minutes, `Actividad: ${activity.text}`);
      });
    },
    [say, scheduleReminder, setExpected],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    modeRef.current = null;
    announcedSectionRef.current = null;
    announcedItemRef.current = null;
    setExpected([]);
    setActive(false);
    setPhase("apagado");
    setSaying("");
    closeWakeWindow();
    clearReminder();
    audioRef.current?.shutdown();
  }, [clearReminder, closeWakeWindow, setExpected]);

  // Se guarda en una ref porque los callbacks del reconocedor se registran una
  // sola vez, al crear la instancia, y necesitan la versión de ahora.
  useEffect(() => {
    handleTranscriptRef.current = (text: string) => {
      // Mientras habla no llega nada: `voiceAudio` no entrega lo oído.
      if (!activeRef.current) return;

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
        // No se las acuerda: se lo guía de a una, empezando ya por la primera.
        // No se le lee la lista entera antes: cada actividad se anuncia cuando
        // le toca, con su propio reloj.
        modeRef.current = "actividad";
        announcedItemRef.current = itemIndex;
        handOverActivity(currentActivity);
        return;
      }

      if (intent === "REPETIR") {
        // Repite solo lo que tiene entre manos: la actividad en curso, o el
        // bloque si dijo que se lo sabía (ahí no hay una actividad en curso:
        // trabaja el bloque entero). No reinicia el reloj ni cambia el modo —
        // pedir que le repitan algo no es empezarlo de nuevo.
        const subject =
          modeRef.current === "bloque"
            ? (currentSection.title ?? "Este bloque")
            : currentActivity.text;
        say([`${subject}. ${COMMAND_HINT}`], () =>
          setExpected(WORKING_INTENTS),
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

    if (!audioRef.current) {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return;

      audioRef.current = createVoiceAudio(browserAudio(Ctor), {
        onTranscript: (text) => handleTranscriptRef.current(text),
        onPhase: setPhase,
        onSaying: setSaying,
        onFailure: (reason) => {
          setFailure(reason);
          stop();
        },
      });
    }

    // Dentro del mismo toque: si `start()` viene de "Encender" o de "Intentar
    // de nuevo", es la única ocasión de destrabar la voz en iOS (ver
    // `speechUnlock`). Desde el arranque automático no estorba.
    unlockSpeechSynthesis();

    activeRef.current = true;
    modeRef.current = null;
    announcedSectionRef.current = null;
    announcedItemRef.current = null;
    setActive(true);
    setFailure(null);
    audioRef.current.activate();
  }, [stop, supported]);

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
        // No queda nada que guiar: se despide y se apaga. Seguir escuchando
        // solo dejaba al teléfono pitando hasta salir de la pantalla.
        say(["Acabaste todo. Si no tienes novedades, finaliza la tarea."], stop);
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
    stop,
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
    complete,
    currentBlockTitle: currentSection?.title ?? null,
    currentActivityText: currentActivity?.text ?? null,
    start,
    stop,
  };
};
