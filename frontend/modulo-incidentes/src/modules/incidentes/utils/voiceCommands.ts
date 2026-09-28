/**
 * Qué cuenta como un comando hablado del operario, y qué es solo conversación.
 *
 * Es la pieza donde se decide si una actividad se da por hecha, así que vive
 * aparte del resto del asistente: es pura, se testea sin navegador, y las reglas
 * que la hacen segura están escritas todas acá y no repartidas por el flujo.
 */

export type VoiceIntent = "FIN" | "NEGACION" | "AFIRMACION";

/**
 * Un comando es una frase CORTA. Nadie confirma una actividad con una oración.
 *
 * Sin este tope, buscar la palabra clave en cualquier parte del texto convierte
 * cualquier charla en un comando. En la prueba de campo pasó tal cual: la frase
 * "...no es imposible que deje minutos abierto pero es así es lo que" —25
 * palabras de una conversación ajena— se clasificó como afirmación por contener
 * "así es". En una unidad real eso es dar por hecha una actividad que nadie
 * hizo, sin que el operario toque nada ni se entere.
 */
export const MAX_COMMAND_WORDS = 4;

/**
 * Se compara por palabra completa, nunca por substring: "bueno" contiene "no" y
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

/**
 * Variantes reales, no una palabra por intención: nadie contesta con el término
 * exacto. En Ecuador un "ya" o un "dale" son afirmaciones tan válidas como "sí".
 *
 * Las tres listas NO corren el mismo riesgo, y por eso no son igual de largas.
 * AFIRMACION y NEGACION solo están vivas unos segundos, justo después de una
 * pregunta directa. FIN está viva todo el rato que el operario trabaja el bloque
 * —pueden ser quince minutos limpiando un baño con el teléfono escuchando—, así
 * que cada palabra suya es una oportunidad de marcar algo que nadie terminó.
 *
 * Por eso quedan FUERA de FIN las muletillas: "listo", "hecho" y "ya está".
 * "Listo, pásame el otro", "eso ya está hecho de antes" y "ya está el trapeador"
 * son frases de trabajo normales, las tres pasan el tope de palabras, y las tres
 * marcarían el bloque. El asistente enseña la fórmula en cada bloque ("cuando
 * termines, di: asistente, acabado") y acá solo se toleran variantes de acabar
 * y terminar.
 */
const INTENT_PHRASES: Record<VoiceIntent, string[]> = {
  FIN: [
    "ya acabe",
    "ya termine",
    "acabado",
    "acabe",
    "terminado",
    "termine",
    "completado",
    "finalizado",
  ],
  NEGACION: [
    // "no me acuerdo" y "no se" están porque la pregunta es literalmente "¿te
    // acuerdas de los elementos?": es la respuesta natural de alguien que no
    // memorizó nada, y sin ellas el asistente no reaccionaría.
    "no me acuerdo",
    "no todavia",
    "todavia no",
    "aun no",
    "no se",
    "no",
    "negativo",
    "nada",
  ],
  AFIRMACION: [
    "asi es",
    // Está acá y NO en FIN: como afirmación solo escucha unos segundos tras una
    // pregunta directa, mientras que en FIN estaría viva los quince minutos que
    // dura el bloque, donde un "listo, pásame el otro" daría trabajo por hecho.
    "listo",
    "si",
    "claro",
    "dale",
    "dele",
    "ya",
    "correcto",
    "afirmativo",
    "ok",
    "okey",
    "bueno",
    "exacto",
  ],
};

/**
 * Frases largas primero: "ya acabé" tiene que ganarle a "ya", o un fin de
 * actividad se leería como una simple afirmación y el bloque no se marcaría.
 */
const MATCHERS = (Object.keys(INTENT_PHRASES) as VoiceIntent[])
  .flatMap((intent) =>
    INTENT_PHRASES[intent].map((phrase) => ({
      intent,
      phrase,
      words: phrase.split(" ").length,
    })),
  )
  .sort((a, b) => b.words - a.words);

/**
 * Lo que hay que anteponer para dar una actividad por terminada.
 *
 * Existe porque el tope de palabras no alcanzaba, y el motivo es estructural: el
 * reconocedor corta lo que oye en segmentos, uno por cada pausa natural al
 * hablar. Un "acabado" dicho al pasar en medio de una charla llega como un
 * segmento de UNA palabra — exactamente igual que un "acabado" dicho a
 * propósito. Por texto son indistinguibles, así que hace falta una segunda
 * señal. Es la misma razón por la que existen "Alexa" y "Oye Siri".
 */
const WAKE_PHRASES = ["oye asistente", "asistente"];

/** `true` si lo que se oyó trae la palabra de activación. */
export const hasWakeWord = (transcript: string): boolean => {
  const normalized = normalize(transcript);
  if (!normalized) return false;

  return WAKE_PHRASES.some((phrase) =>
    new RegExp(`(^| )${phrase}( |$)`).test(normalized),
  );
};

/**
 * Reconoce un comando en lo que se oyó, o devuelve `null`.
 *
 * `expected` es la barrera más efectiva del día a día: el flujo declara qué
 * está esperando en ese momento y todo lo demás se ignora. Mientras se espera un
 * "acabado", un "sí" suelto de una conversación no hace nada.
 *
 * `requireWake` es la que protege lo único irreversible —dar trabajo por
 * hecho—: con ella puesta, un "acabado" pelado no cuenta y hay que decir
 * "asistente, acabado".
 */
export const recognizeCommand = (
  transcript: string,
  expected: VoiceIntent[],
  options?: { requireWake?: boolean },
): VoiceIntent | null => {
  const normalized = normalize(transcript);
  if (!normalized) return null;

  // Se queda aunque haya activación: sin él, una frase larga que mencione
  // "asistente" y "acabado" volvería a colarse.
  if (normalized.split(" ").length > MAX_COMMAND_WORDS) return null;

  if (options?.requireWake && !hasWakeWord(normalized)) return null;

  const candidates = MATCHERS.filter((matcher) =>
    expected.includes(matcher.intent),
  );

  for (const matcher of candidates) {
    if (new RegExp(`(^| )${matcher.phrase}( |$)`).test(normalized)) {
      return matcher.intent;
    }
  }

  return null;
};
