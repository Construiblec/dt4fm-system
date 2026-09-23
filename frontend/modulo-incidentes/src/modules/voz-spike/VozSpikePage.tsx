import { useEffect, useRef, useState } from "react";

/**
 * PÁGINA DESECHABLE — spike del asistente de voz.
 *
 * Se borra entera junto con su ruta en `router.tsx`. No importa nada del
 * checklist, no toca el store y no llama al backend: si este archivo desaparece,
 * no se rompe nada.
 *
 * Existe para responder, en el teléfono real del operario y dentro de la PWA
 * instalada, las cuatro preguntas que pueden matar el diseño manos libres:
 *
 *  1. ¿Existe reconocimiento de voz en ese navegador?
 *  2. ¿Entiende "sí", "no" y "acabado" en español con el agua corriendo?
 *  3. ¿Funciona sin datos? (en Android el audio viaja a los servidores de Google)
 *  4. ¿Se vuelve a armar solo, sin que nadie toque la pantalla, y sobrevive a que
 *     el teléfono se guarde en el bolsillo?
 *
 * Todo se muestra en pantalla porque en un celular no hay consola: el botón
 * "Copiar reporte" deja el diagnóstico completo listo para pegar.
 */

// ── Tipos mínimos de la Web Speech API ──────────────────────────────────────
// No están en lib.dom de forma portable (en Safari el constructor sigue siendo
// `webkitSpeechRecognition`), así que se declara solo lo que se usa.

type SpeechAlternative = { transcript: string; confidence: number };

type SpeechResult = {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
};

type SpeechResultList = {
  readonly length: number;
  [index: number]: SpeechResult;
};

type SpeechResultEvent = { resultIndex: number; results: SpeechResultList };

type SpeechErrorEvent = { error: string; message?: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onnomatch: (() => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type WakeLockSentinelLike = { release: () => Promise<void> };

const getRecognitionCtor = (): SpeechRecognitionCtor | null => {
  const target = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return target.SpeechRecognition ?? target.webkitSpeechRecognition ?? null;
};

const requestWakeLock = async (): Promise<WakeLockSentinelLike | null> => {
  const target = navigator as unknown as {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
  };
  if (!target.wakeLock) return null;
  return target.wakeLock.request("screen");
};

// ── Diccionario ─────────────────────────────────────────────────────────────

type Intent = "FIN" | "NEGACION" | "AFIRMACION";

/**
 * Se compara por palabra completa, no por substring: "bueno" contiene "no" y
 * "listo" contiene "si". Con substring, un "bueno" se leería como negación.
 */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const INTENT_PHRASES: Record<Intent, string[]> = {
  // Orden de prioridad: "si ya acabe" es FIN, no AFIRMACION.
  FIN: [
    "ya esta",
    "ya termine",
    "ya acabe",
    "acabado",
    "acabe",
    "terminado",
    "termine",
    "completado",
    "finalizado",
    "listo",
    "hecho",
  ],
  NEGACION: ["todavia no", "aun no", "no todavia", "no", "negativo", "nada"],
  AFIRMACION: ["asi es", "si", "claro", "dale", "correcto", "afirmativo", "ok", "okey", "bueno", "exacto", "ya"],
};

/** Frases largas primero, y a igual longitud manda el orden de las categorías. */
const MATCHERS: { intent: Intent; phrase: string; words: number }[] = (
  Object.keys(INTENT_PHRASES) as Intent[]
)
  .flatMap((intent) =>
    INTENT_PHRASES[intent].map((phrase) => ({
      intent,
      phrase,
      words: phrase.split(" ").length,
    })),
  )
  .sort((a, b) => b.words - a.words);

const classify = (text: string): Intent | null => {
  const normalized = normalize(text);
  if (!normalized) return null;

  for (const matcher of MATCHERS) {
    if (new RegExp(`(^| )${matcher.phrase}( |$)`).test(normalized)) {
      return matcher.intent;
    }
  }

  return null;
};

const INTENT_LABEL: Record<Intent, string> = {
  FIN: "ACABADO",
  NEGACION: "NO",
  AFIRMACION: "SÍ",
};

const INTENT_ACK: Record<Intent, string> = {
  FIN: "Listo. Siguiente.",
  NEGACION: "Bien, te leo los elementos.",
  AFIRMACION: "Adelante.",
};

// ── Bitácora ────────────────────────────────────────────────────────────────

type LogEntry = { at: string; kind: string; text: string };

const MAX_LOG = 300;

const stamp = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds(),
  ).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
};

export const VozSpikePage = () => {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [ttsSupported] = useState(() => typeof window.speechSynthesis !== "undefined");
  const [spanishVoices, setSpanishVoices] = useState(0);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("detenido");
  const [heard, setHeard] = useState("");
  const [interim, setInterim] = useState("");
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [counters, setCounters] = useState({ results: 0, restarts: 0, nomatch: 0 });
  const [errors, setErrors] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const runningRef = useRef(false);
  /** "listening" | "speaking" | "idle": decide si `onend` vuelve a armar el micro. */
  const modeRef = useRef<"idle" | "listening" | "speaking">("idle");
  const speechStartedAtRef = useRef<number | null>(null);
  const listenStartedAtRef = useRef(0);
  const restartTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const addLog = (kind: string, text: string) => {
    setLog((entries) => [{ at: stamp(), kind, text }, ...entries].slice(0, MAX_LOG));
  };

  // Las funciones de abajo se llaman entre sí (escuchar → oír → hablar → volver a
  // escuchar). Son declaraciones, así que el hoisting resuelve el ciclo y no hace
  // falta pasarlas por refs.

  function startListening() {
    const recognition = recognitionRef.current;
    if (!recognition || !runningRef.current) return;

    modeRef.current = "listening";

    try {
      recognition.start();
    } catch (error) {
      // start() sobre una instancia que todavía no terminó tira InvalidStateError.
      // Es esperable en el rearme rápido; se reintenta una vez.
      addLog("aviso", `start() rechazado: ${(error as Error).name}. Reintento en 600ms.`);
      scheduleRestart(600);
    }
  }

  function scheduleRestart(delay: number) {
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (runningRef.current) startListening();
    }, delay);
  }

  function speak(text: string) {
    if (!ttsSupported) {
      addLog("tts", "no hay síntesis de voz en este navegador");
      scheduleRestart(300);
      return;
    }

    modeRef.current = "speaking";
    setStatus("hablando");
    addLog("tts", `dice: "${text}"`);

    const synthesis = window.speechSynthesis;
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";

    let resumed = false;
    const resume = (reason: string) => {
      if (resumed) return;
      resumed = true;
      addLog("tts", `terminó de hablar (${reason})`);
      if (runningRef.current) scheduleRestart(250);
    };

    utterance.onend = () => resume("onend");
    utterance.onerror = () => resume("onerror");
    // iOS a veces no dispara ningún evento al terminar. Sin este respaldo el ciclo
    // se queda mudo para siempre, que es justo lo que hay que detectar.
    window.setTimeout(() => resume("respaldo 6s"), 6000);

    synthesis.speak(utterance);
  }

  function buildRecognition(): SpeechRecognitionLike | null {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.lang = "es-ES";
    // `continuous: false` es lo más confiable en Android. El "manos libres" real
    // no lo da esta bandera, sino el rearme automático en `onend` — que es
    // exactamente la pregunta 4 del spike.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      // El cero del cronómetro va acá y no en `startListening`: el micro empieza
      // a escuchar de verdad cuando el navegador dispara este evento, no cuando
      // se llama a `start()`.
      listenStartedAtRef.current = Date.now();
      speechStartedAtRef.current = null;
      setStatus("escuchando");
      addLog("micro", "escuchando");
    };
    recognition.onaudiostart = () => addLog("micro", "entra audio");
    recognition.onspeechstart = () => {
      speechStartedAtRef.current = Date.now();
      addLog("micro", "detectó voz");
    };
    recognition.onspeechend = () => addLog("micro", "dejó de detectar voz");

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0]?.transcript ?? "";

      if (!result.isFinal) {
        setInterim(transcript);
        return;
      }

      const since = speechStartedAtRef.current ?? listenStartedAtRef.current;
      const elapsed = Date.now() - since;
      const matched = classify(transcript);
      const options: string[] = [];
      for (let index = 0; index < result.length; index += 1) {
        options.push(`${result[index].transcript} (${result[index].confidence.toFixed(2)})`);
      }

      setInterim("");
      setHeard(transcript);
      setAlternatives(options);
      setIntent(matched);
      setLatency(elapsed);
      setCounters((current) => ({ ...current, results: current.results + 1 }));
      addLog(
        "oyó",
        `"${transcript}" → ${matched ? INTENT_LABEL[matched] : "sin clasificar"} · ${elapsed}ms`,
      );

      if (matched) speak(INTENT_ACK[matched]);
    };

    recognition.onnomatch = () => {
      setCounters((current) => ({ ...current, nomatch: current.nomatch + 1 }));
      addLog("micro", "nomatch (oyó algo pero no lo entendió)");
    };

    recognition.onerror = (event) => {
      setErrors((current) => ({ ...current, [event.error]: (current[event.error] ?? 0) + 1 }));
      addLog("error", `${event.error}${event.message ? ` — ${event.message}` : ""}`);

      // Sin permiso de micrófono no hay nada que reintentar: el bucle solo
      // generaría ruido en la bitácora.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopSession("permiso de micrófono denegado");
      }
    };

    recognition.onend = () => {
      addLog("micro", "se cerró el micro");
      // Si está hablando, el rearme lo hace el final del TTS: arrancar ahora haría
      // que el teléfono se escuche a sí mismo.
      if (runningRef.current && modeRef.current === "listening") {
        setCounters((current) => ({ ...current, restarts: current.restarts + 1 }));
        setStatus("rearmando");
        scheduleRestart(300);
      }
    };

    return recognition;
  }

  function startSession() {
    if (!supported) return;

    if (!recognitionRef.current) recognitionRef.current = buildRecognition();
    if (!recognitionRef.current) return;

    runningRef.current = true;
    setRunning(true);
    setStatus("iniciando");
    addLog("sesión", `iniciada — online: ${navigator.onLine ? "sí" : "no"}`);
    speak("¿Terminaste?");
  }

  function stopSession(reason: string) {
    runningRef.current = false;
    modeRef.current = "idle";
    setRunning(false);
    setStatus("detenido");
    addLog("sesión", `detenida — ${reason}`);

    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      // Abortar una instancia que ya estaba cerrada no importa.
    }
    if (ttsSupported) window.speechSynthesis.cancel();
  }

  const toggleWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release().catch(() => undefined);
      wakeLockRef.current = null;
      setWakeLockOn(false);
      addLog("pantalla", "wake lock liberado");
      return;
    }

    try {
      const sentinel = await requestWakeLock();
      if (!sentinel) {
        addLog("pantalla", "este navegador no tiene Wake Lock");
        return;
      }
      wakeLockRef.current = sentinel;
      setWakeLockOn(true);
      addLog("pantalla", "wake lock tomado (la pantalla no se apaga)");
    } catch (error) {
      addLog("pantalla", `wake lock falló: ${(error as Error).name}`);
    }
  };

  const copyReport = async () => {
    const report = [
      "== SPIKE DE VOZ ==",
      `Fecha: ${new Date().toISOString()}`,
      `UA: ${navigator.userAgent}`,
      `Reconocimiento: ${supported ? "sí" : "NO"} · Síntesis: ${ttsSupported ? "sí" : "NO"} · Voces es-*: ${spanishVoices}`,
      `PWA instalada: ${window.matchMedia("(display-mode: standalone)").matches ? "sí" : "no"}`,
      `Online: ${online ? "sí" : "no"} · Wake lock: ${wakeLockOn ? "sí" : "no"}`,
      `Resultados: ${counters.results} · Rearmes: ${counters.restarts} · Nomatch: ${counters.nomatch}`,
      `Errores: ${Object.entries(errors).map(([key, value]) => `${key}=${value}`).join(", ") || "ninguno"}`,
      "",
      "== BITÁCORA (más reciente primero) ==",
      ...log.map((entry) => `${entry.at} [${entry.kind}] ${entry.text}`),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      addLog("aviso", "el portapapeles falló; seleccioná la bitácora a mano");
    }
  };

  useEffect(() => {
    const readVoices = () => {
      if (!window.speechSynthesis) return;
      setSpanishVoices(
        window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("es")).length,
      );
    };
    readVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", readVoices);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", readVoices);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Al salir de la pantalla hay que soltar el micro y la pantalla: si no, el
  // navegador sigue mostrando el indicador de grabación.
  useEffect(
    () => () => {
      runningRef.current = false;
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ya estaba cerrada.
      }
      window.speechSynthesis?.cancel();
      void wakeLockRef.current?.release().catch(() => undefined);
    },
    [],
  );

  return (
    <main className="min-h-screen bg-slate-900 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-lg space-y-4">
        <header>
          <h1 className="text-xl font-bold">Spike de voz</h1>
          <p className="mt-1 text-sm text-slate-400">
            Pantalla de prueba. No guarda nada ni toca el checklist.
          </p>
        </header>

        {/* Lo primero que hay que saber al abrirla en el celular del operario. */}
        <section className="grid grid-cols-2 gap-2 text-sm">
          <Flag label="Reconocimiento" ok={supported} />
          <Flag label="Voz (TTS)" ok={ttsSupported} />
          <Flag label="Conexión" ok={online} okText="con datos" failText="SIN datos" />
          <Flag label={`Voces es-* (${spanishVoices})`} ok={spanishVoices > 0} />
        </section>

        {!supported ? (
          <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            Este navegador no tiene reconocimiento de voz. El diseño manos libres no
            funciona acá: hay que probar en otro navegador o replantear la solución.
          </p>
        ) : null}

        {/* Lo grande: lo que entendió y cómo lo clasificó. */}
        <section className="rounded-3xl bg-slate-800 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Estado: {status}</p>

          <p className="mt-4 min-h-[3.5rem] text-3xl font-bold leading-tight">
            {heard || <span className="text-slate-600">—</span>}
          </p>

          {interim ? <p className="mt-1 text-lg italic text-slate-400">{interim}…</p> : null}

          <div className="mt-4 flex items-center gap-3">
            <span
              className={`rounded-xl px-4 py-2 text-2xl font-black ${
                intent === "FIN"
                  ? "bg-emerald-500 text-slate-900"
                  : intent === "AFIRMACION"
                    ? "bg-cyan-400 text-slate-900"
                    : intent === "NEGACION"
                      ? "bg-amber-400 text-slate-900"
                      : "bg-slate-700 text-slate-400"
              }`}
            >
              {intent ? INTENT_LABEL[intent] : "sin clasificar"}
            </span>
            {latency !== null ? (
              <span className="text-2xl font-bold tabular-nums text-slate-300">{latency} ms</span>
            ) : null}
          </div>

          {alternatives.length > 1 ? (
            <p className="mt-3 text-xs text-slate-400">
              También consideró: {alternatives.slice(1).join(" · ")}
            </p>
          ) : null}
        </section>

        <section className="grid grid-cols-3 gap-2 text-center">
          <Counter label="Resultados" value={counters.results} />
          <Counter label="Rearmes" value={counters.restarts} />
          <Counter label="Nomatch" value={counters.nomatch} />
        </section>

        {Object.keys(errors).length > 0 ? (
          <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p className="font-semibold">Errores</p>
            <ul className="mt-1 space-y-1">
              {Object.entries(errors).map(([key, value]) => (
                <li key={key}>
                  {key}: {value}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => (running ? stopSession("el usuario la detuvo") : startSession())}
            disabled={!supported}
            className={`w-full rounded-2xl px-4 py-5 text-lg font-bold transition ${
              running
                ? "bg-red-500 text-white"
                : supported
                  ? "bg-emerald-500 text-slate-900"
                  : "cursor-not-allowed bg-slate-700 text-slate-500"
            }`}
          >
            {running ? "Detener" : "Empezar"}
          </button>

          <button
            type="button"
            onClick={toggleWakeLock}
            className="w-full rounded-2xl border border-slate-600 px-4 py-4 text-sm font-semibold text-slate-200"
          >
            {wakeLockOn ? "Soltar pantalla (dejar que se apague)" : "Mantener la pantalla encendida"}
          </button>

          <button
            type="button"
            onClick={copyReport}
            className="w-full rounded-2xl border border-slate-600 px-4 py-4 text-sm font-semibold text-slate-200"
          >
            {copied ? "¡Copiado!" : "Copiar reporte"}
          </button>
        </div>

        {/* En un celular no hay consola: la bitácora es la única forma de ver qué
            pasó mientras el teléfono estuvo en el bolsillo. */}
        <section className="rounded-2xl bg-slate-800 p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">
            Bitácora ({log.length})
          </p>
          <ul className="max-h-80 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {log.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="text-slate-300">
                <span className="text-slate-500">{entry.at}</span>{" "}
                <span className="text-cyan-400">[{entry.kind}]</span> {entry.text}
              </li>
            ))}
            {log.length === 0 ? <li className="text-slate-500">Sin eventos todavía.</li> : null}
          </ul>
        </section>
      </div>
    </main>
  );
};

const Flag = ({
  label,
  ok,
  okText = "sí",
  failText = "NO",
}: {
  label: string;
  ok: boolean;
  okText?: string;
  failText?: string;
}) => (
  <div
    className={`rounded-xl px-3 py-2 ${ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}
  >
    <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
    <p className="font-bold">{ok ? okText : failText}</p>
  </div>
);

const Counter = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-slate-800 px-3 py-2">
    <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-xl font-bold tabular-nums">{value}</p>
  </div>
);
