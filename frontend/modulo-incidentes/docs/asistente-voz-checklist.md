# Asistente de Voz para el Checklist de Limpieza – Frontend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Este documento describe el asistente de voz que permite completar el checklist de una tarea de limpieza manos libres: el teléfono va dictando qué corresponde hacer y entiende las respuestas habladas del operario.

Vive dentro de la pantalla de ejecución de la tarea (`CleaningTaskExecutionPage`), como una capa más sobre el checklist existente — no es una pantalla aparte ni una app distinta. El checklist sigue funcionando idéntico con el dedo; la voz es un camino adicional al mismo estado.

**No depende de ningún backend propio.** Usa la [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) del navegador (`SpeechRecognition` + `speechSynthesis`), que corre client-side. El checklist que lee ya llega parseado desde la plantilla CSV de la tarea (ver `cleaningChecklistUtils.ts`); el asistente no agrega ninguna llamada de red.

---

## 2. Por qué el diseño quedó así

### El estado por actividad ya existía, y era justamente para esto

El checklist se muestra al operario por **bloques** (una tarjeta por sección, un solo tap la marca entera), pero el progreso se guarda por **actividad individual** en el store (`checklistProgress: Record<number, boolean>`, indexado por `checkableIndex`). Esa granularidad oculta se construyó en un cambio anterior con la intención explícita de dejarla lista para un comando de voz que confirmara elemento por elemento sin ensuciar la interfaz visual.

La acción `updateChecklistItem` del store llevaba semanas sin usarse, con el comentario:

> *"Una actividad suelta. Es por acá que el comando de voz va a confirmar."*

El asistente es la primera pieza que la usa de verdad.

### La respuesta a la pregunta del bloque fija la granularidad

Como los minutos de la plantilla vienen **por actividad** (columna `Minutos` del CSV), no por bloque, el asistente necesita saber con qué precisión confirmar para que un recordatorio de tiempo tenga sentido real. Eso lo decide la primera pregunta de cada bloque:

- **"¿Te acuerdas de los elementos?" → sí:** se trabaja el **bloque entero**. El teléfono se calla, el reloj corre con la suma de los minutos del bloque, y un solo "acabado" marca todas las actividades de una vez (`setChecklistItems`, el mismo camino que usa el tap).
- **→ no:** se trabaja **actividad por actividad**. El asistente no lee la lista entera: anuncia cada actividad cuando le toca, el reloj corre con los minutos de cada actividad individual, y cada "acabado" marca solo esa (`updateChecklistItem`).

Los dos caminos convergen al mismo estado: el check visual del bloque aparece cuando todas sus actividades están en `true`, sin que a la interfaz le importe si llegaron de a una o de una sola vez.

### Palabra de activación: no es capricho, es un bug real que se reprodujo en vivo

La primera versión reconocía "acabado" como comando en cualquier momento en que el asistente esperaba el fin de una actividad. En una demostración real, alguien dijo la palabra "acabado" en medio de una frase — sin intención de confirmar nada — y el asistente marcó el bloque.

La causa es estructural, no un descuido de vocabulario: el reconocedor con `continuous: true` corta lo que oye en **segmentos**, uno por cada pausa natural del habla. Un "acabado" dicho al pasar en una conversación llega como un segmento de una sola palabra — **exactamente igual**, por texto, a un "acabado" dicho a propósito. No hay forma de distinguirlos analizando solo el texto.

La solución es la misma que usan Alexa o Siri: una palabra de activación. Terminar una actividad o pedir que repita exige anteponer **"asistente"** (o "oye asistente"). El sí/no de la pregunta del bloque **no** la necesita, porque vive solo unos segundos justo después de una pregunta directa, y equivocarse ahí no da ningún trabajo por hecho.

### La ventana de activación, y por qué no hay una respuesta hablada a "asistente"

Exigir las dos palabras en la misma frase no alcanza: si el operario hace una pausa entre "asistente" y "acabado", el reconocedor las corta en dos segmentos distintos y ninguno coincide por separado — el mismo mecanismo que causó el bug original, ahora jugando en contra.

Por eso decir "asistente" abre una **ventana de 8 segundos** (`WAKE_WINDOW_MS`) durante la cual un "acabado" o "repite" sueltos sí cuentan.

La primera implementación hacía que el asistente contestara "Dime" al oír "asistente" solo. Eso también era un bug: con resultados parciales, "asistente, acabado" llega al reconocedor en **dos entregas** — primero `"asistente"`, después `"asistente acabado"` —, así que contestar a la primera entrega apagaba el micrófono para hablar (`say()` siempre lo hace) y se comía el resto del comando. La ventana ahora se abre **en silencio**, sin que el asistente diga nada ni deje de escuchar. Que está esperando el comando se ve en pantalla (`awake`), no se oye.

### Por qué la fórmula se repite en cada anuncio

*"Di: asistente, acabado cuando finalices."* se dice al final de **cada** anuncio de actividad y de bloque, no solo la primera vez. Un operario que la escuchó al abrir el primer bloque no la recuerda tres bloques después, y sin la palabra de activación un "acabado" sencillo no tiene ningún efecto — la única señal de que algo salió mal sería el silencio.

### El tope de 4 palabras

Sin límite de longitud, cualquier frase larga que mencione una palabra clave se cuela como comando. En la prueba de campo, una frase de 25 palabras de una conversación ajena se clasificó como afirmación por contener "así es" en algún punto. `MAX_COMMAND_WORDS = 4` descarta cualquier cosa más larga que eso, sin importar qué contenga.

---

## 3. Arquitectura

```
voiceCommands.ts   →  qué es un comando (función pura, sin navegador)
voiceReminder.ts   →  cuándo toca recordar (función pura, sin navegador)
useVoiceChecklist  →  el motor: habla, escucha, arma la conversación
VoiceChecklistControl → lo que el operario ve y toca
CleaningTaskChecklist → hospeda el hook, conecta con el store existente
```

### Componentes principales

| Archivo | Responsabilidad |
| --- | --- |
| `utils/voiceCommands.ts` | Diccionario de comandos, palabra de activación, todas las reglas de seguridad. Pura y testeada. |
| `utils/voiceReminder.ts` | Regla de cuándo insistir con el recordatorio. Pura y testeada. |
| `hooks/useVoiceChecklist.ts` | El bucle de conversación completo: habla (`SpeechSynthesisUtterance`), escucha (`SpeechRecognition`), decide granularidad, arma y cancela recordatorios. |
| `components/VoiceChecklistControl.tsx` | Estado visible (escuchando / hablando / apagado), última frase entendida, en qué bloque/actividad va, encendido y apagado manual. |
| `components/CleaningTaskChecklist.tsx` | Conecta el hook con las dos acciones del store (`setChecklistItems`, `updateChecklistItem`) y arranca el asistente automáticamente al montar. |

### Por qué el diccionario y el recordatorio son funciones puras aparte

El proyecto corre sus tests de frontend con `environment: 'node'` (sin jsdom), así que no hay forma de testear el hook completo, que depende de `SpeechRecognition` y `speechSynthesis`. Las dos piezas donde hay una decisión que se puede equivocar — *"¿esto es un comando?"* y *"¿toca avisar ahora?"* — se extrajeron a funciones puras sin ninguna dependencia de navegador, y son las que llevan la cobertura de tests real (138 tests entre las dos, más los del parser del checklist).

---

## 4. El diccionario de comandos (`voiceCommands.ts`)

### Intenciones

```ts
export type VoiceIntent = "FIN" | "REPETIR" | "NEGACION" | "AFIRMACION";
```

| Intención | Frases reconocidas | Exige "asistente" | Vive mientras… |
| --- | --- | --- | --- |
| `AFIRMACION` | sí, así es, claro, dale, dele, ya, correcto, afirmativo, ok, okey, bueno, exacto, **listo** | No | …dura la pregunta del bloque (segundos) |
| `NEGACION` | no, todavía no, aún no, no todavía, negativo, nada, no me acuerdo, no sé | No | …dura la pregunta del bloque (segundos) |
| `FIN` | acabado, acabé, ya acabé, terminado, terminé, ya terminé, completado, finalizado | **Sí** | …dura todo el bloque o la actividad (minutos) |
| `REPETIR` | repite, repiteme, repetir, otra vez, de nuevo | **Sí** | …dura todo el bloque o la actividad (minutos) |

**"Listo" está en `AFIRMACION` y deliberadamente NO en `FIN`.** Ahí es donde vivía originalmente, y se movió: "listo", "hecho" y "ya está" son muletillas de trabajo normales ("listo, pásame el otro", "ya está el trapeador") que pasarían el tope de palabras y marcarían actividades sin que nadie las hubiera terminado. Como afirmación, el riesgo es mínimo porque la ventana de escucha es de segundos.

### Reglas de seguridad, todas en `recognizeCommand()`

1. **Tope de 4 palabras** (`MAX_COMMAND_WORDS`) — descarta cualquier frase más larga, sin importar qué contenga.
2. **Filtro por lo esperado** (`expected: VoiceIntent[]`) — el flujo declara qué intenciones tienen efecto en cada momento; el resto se ignora aunque coincida textualmente.
3. **Palabra de activación** (`requireWake`) — obligatoria para `FIN` y `REPETIR` fuera de la ventana de 8 segundos.
4. **Coincidencia por palabra completa**, nunca por substring — "bueno" no matchea "no", "listo" no matchea "si".
5. **Frase larga antes que corta** al ordenar los candidatos — "ya acabé" tiene que ganarle a "ya", o un fin de actividad se leería como una simple afirmación.

---

## 5. El recordatorio (`voiceReminder.ts`)

```ts
export const reminderDelayMs = (
  totalMinutes: number | null,
  timesRemindedSoFar: number,
): number | null
```

- Primer aviso: al cumplirse los minutos que la plantilla asigna (al bloque completo si el modo es "bloque", a la actividad si el modo es "actividad").
- A partir del segundo: cada **2 minutos** fijos (`REMINDER_REPEAT_MS`), sin tope — sigue insistiendo hasta que se confirme.
- `null` (no avisa nunca) si no hay minutos definidos: una plantilla a medio llenar no tiene contra qué comparar, y avisar con un tiempo inventado sería peor que quedarse callado.

El texto dicho es siempre *"¿Acabaste? \<bloque o actividad\>. Recuerda decir: asistente, acabado."* — nombra específicamente qué está pendiente, para que el operario no tenga que mirar la pantalla para saber a qué se refiere.

**No tiene ninguna consecuencia ni penalización.** Es exclusivamente un recordatorio hablado; no bloquea nada, no cambia colores, no genera ningún registro distinto al resto del checklist.

### Guardas contra interrumpir

El recordatorio se salta su turno (no se encola, no se retrasa) si en ese momento:

- El asistente ya está hablando — no corta una lectura de actividades a la mitad.
- La ventana de activación está abierta — el operario acaba de decir "asistente" y está por decir el comando; interrumpir ahí apagaría el micrófono y se lo comería.

---

## 6. El motor de conversación (`useVoiceChecklist.ts`)

### Qué sigue

```ts
const pendiente = sections
  .flatMap((section) => section.items.map((item) => ({ section, item })))
  .find(({ item }) => !progress[item.checkableIndex]);
```

La primera actividad sin completar, **derivada del progreso**, nunca de un índice propio que el hook lleve por su cuenta. Esto es lo que hace que voz y tap convivan sin necesidad de sincronizarse: si el operario marca un bloque entero con el dedo, lo pendiente cambia solo y el asistente pasa al siguiente bloque sin volver a preguntar por algo ya hecho.

### El flujo completo

```
Asistente: "Dormitorio. ¿Te acuerdas de los elementos?"

── "sí" → se trabaja el bloque completo ──────────────────
Operario:  "sí"
Asistente: "Di: asistente, acabado cuando finalices."
           (silencio — reloj = suma de minutos del bloque)

Operario:  "asistente, acabado"
                              → marca TODO el bloque
Asistente: "Dormitorio listo. Baño. ¿Te acuerdas de los elementos?"

── "no" → se trabaja actividad por actividad ─────────────
Operario:  "no"
Asistente: "Separar la cama del espaldar. Di: asistente,
            acabado cuando finalices."
           (reloj = minutos de ESA actividad)

Operario:  "asistente, acabado"
                              → marca UNA actividad
Asistente: "Sacar las almohadas de sus fundas. Di: asistente,
            acabado cuando finalices."
   … (se repite hasta cerrar el bloque)

── en cualquier momento ───────────────────────────────────
Operario:  "asistente, repite"  → relee sin cambiar de modo
```

### Apagar el micrófono mientras habla

`say()` siempre detiene el reconocimiento antes de hablar y lo reanuda al terminar. No es una optimización: casi todas las frases del asistente contienen la palabra "acabado" ("Di: asistente, acabado cuando finalices"), y si el teléfono se oyera a sí mismo se daría el trabajo por hecho solo.

### Configuración del reconocedor

```ts
recognition.continuous = true;
recognition.interimResults = true;
```

`continuous: true` es obligatorio: con `false`, el reconocedor cierra la sesión de escucha en cuanto detecta una pausa, y en la prueba de campo eso hizo perder más de la mitad de lo que el operario decía — cerraba antes de terminar de procesar la transcripción. Con `interimResults: true` el hook actúa sobre resultados **parciales**, no solo sobre el resultado final (que en Chrome móvil suele tardar o no llegar).

### Ciclo de vida y limpieza

- El asistente **arranca automáticamente** al montar `CleaningTaskChecklist` (que solo existe mientras la tarea está en ejecución). No hace falta que el operario lo encienda.
- El pedido de permiso de micrófono lo dispara el propio navegador la primera vez que se llama a `recognition.start()` — no hay ningún diálogo propio de la app antes de eso.
- Si el operario rechaza el permiso, o el navegador no soporta `SpeechRecognition`/`speechSynthesis`, el hook expone `failure: "sin-microfono" | "sin-soporte"` y dejo de intentar: el checklist sigue funcionando 100% por tap, sin ningún bloqueo.
- Al desmontar la pantalla (`useEffect` de limpieza), se llama `stop()`: aborta el reconocimiento, cancela cualquier síntesis en curso y libera todos los temporizadores. Sin esto, el navegador seguiría mostrando el indicador de "grabando" sobre una pantalla que ya no existe.
- El botón de apagar en `VoiceChecklistControl` llama al mismo `stop()`; volver a encenderlo es un nuevo `start()` limpio.

---

## 7. Integración con el checklist existente (`CleaningTaskChecklist.tsx`)

```ts
const completeSectionByVoice = (section) =>
  setChecklistItems(getSectionIndices(section), true);

const completeActivityByVoice = (activity) =>
  updateChecklistItem(activity.checkableIndex, true);

const voice = useVoiceChecklist({
  sections,
  progress: checklistProgress,
  onSectionComplete: completeSectionByVoice,
  onActivityComplete: completeActivityByVoice,
});
```

Las dos funciones de callback llaman a acciones del store **que ya existían** para el tap. No hay un camino de datos paralelo para la voz: confirmar hablando y confirmar tocando terminan escribiendo exactamente lo mismo, así que la barra de progreso, el contador de bloques completados y la habilitación del botón "Finalizar tarea" se actualizan solos, sin ningún código adicional que los sincronice.

---

## 8. Testing

138 tests en el módulo de checklist, de los cuales los relevantes a la voz son:

| Archivo | Qué cubre |
| --- | --- |
| `voiceCommands.test.ts` | Cada intención y sus variantes; palabra de activación (incluye el caso exacto del bug de campo: *"acabado" suelto → null*, *"asistente, acabado" → FIN*); tope de palabras; que las intenciones fuera de lo esperado se ignoren; que "listo" sea afirmación y nunca fin. |
| `voiceReminder.test.ts` | Primer aviso vs. insistencia; `null` sin minutos; no se rompe con `NaN`/`Infinity`; redondeo de minutos decimales. |

El motor (`useVoiceChecklist`) y el control visual no tienen test automatizado — dependen de `SpeechRecognition`/`speechSynthesis`, que no existen en el entorno de test (`environment: 'node'`, sin jsdom). Se verificaron manualmente en Chrome de escritorio y Chrome Android.

### Notas de verificación manual

- **Brave no sirve**: no incluye la clave de la API de reconocimiento de voz de Google y falla siempre con error `network`. Probar en Chrome.
- El caso que el bug del "Dime" rompía — decir "asistente, acabado" de corrido, sin pausa — es el primero a reprobar ante cualquier cambio futuro en la ventana de activación.
- Contestar "no" y confirmar que el check del bloque **no aparece** hasta cerrar la última actividad es la prueba de que se está escribiendo por actividad y no por bloque.

---

## 9. Limitaciones conocidas / fuera de alcance

- **No hay reconocimiento en iOS Safari** de forma confiable — es una limitación del navegador, no de esta implementación. El asistente se degrada a `failure: "sin-soporte"` y el checklist sigue por tap.
- **Sin señal sonora de confirmación** en el camino "sí" (bloque). Si el ruido ambiente tapa el "asistente, acabado" y el operario no se da cuenta, es posible que lo repita y ese segundo intento caiga sobre el bloque siguiente. Mitigable a futuro con un sonido corto de confirmación; no implementado en esta versión.
- **El pedido de permiso de micrófono es el del navegador**, sin una pantalla propia previa que explique para qué sirve antes de que aparezca. Se apoya en que el operario ya vio el aviso en la pantalla previa al inicio de la tarea (`CleaningTaskPreStart`, `showVoiceNotice`).
