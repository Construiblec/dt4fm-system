/**
 * "Destraba" la síntesis de voz para el resto de la sesión de esta pestaña.
 *
 * iOS exige que la PRIMERA llamada a `speechSynthesis.speak()` de la navegación
 * ocurra de forma síncrona, dentro del handler de un gesto real del usuario —
 * el mismo tipo de restricción que el autoplay de audio/video. "Chrome" en
 * iPhone no cambia nada acá: Apple obliga a todos los navegadores a correr
 * sobre WebKit, así que la restricción es del sistema operativo, no de Safari.
 *
 * El asistente arranca varios saltos asíncronos después del tap en "Iniciar
 * tarea": la mutación viaja por red, y el anuncio del primer bloque se difiere
 * con un `setTimeout` (necesario para no violar las reglas de React sobre
 * `setState` dentro de efectos). Para cuando el asistente intenta decir su
 * primera frase, ya no queda nada del gesto original — e iOS descarta la voz
 * en silencio: no hay error, no hay evento `onerror`, simplemente no suena.
 *
 * Por eso esta llamada tiene que vivir en el handler del tap mismo (ver
 * `useStartCleaningTask`), no en el hook de voz: para cuando ese hook actúa,
 * el gesto ya se perdió.
 */
export const unlockSpeechSynthesis = (): void => {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  try {
    // Un espacio, no una cadena vacía: en algunos motores un utterance vacío
    // no cuenta como una llamada real y no llega a destrabar nada. Volumen
    // normal, no 0: silenciarla podría hacer que el motor la trate como que
    // nunca se reprodujo de verdad, que es justo lo que hace falta evitar.
    const utterance = new SpeechSynthesisUtterance(" ");
    window.speechSynthesis.speak(utterance);
  } catch {
    // Si falla, el asistente sigue su curso normal: en el peor caso queda
    // sin voz en ese dispositivo, pero nada más del flujo se rompe.
  }
};
