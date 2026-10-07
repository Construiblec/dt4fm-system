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
voiceAudio.ts      →  micrófono y voz: cuándo se abre, cuándo habla, cuándo se rinde
useVoiceChecklist  →  el motor: arma la conversación sobre voiceAudio
VoiceChecklistControl → lo que el operario ve y toca
CleaningTaskChecklist → hospeda el hook, conecta con el store existente
```

### Componentes principales

| Archivo | Responsabilidad |
| --- | --- |
| `utils/voiceCommands.ts` | Diccionario de comandos, palabra de activación, todas las reglas de seguridad. Pura y testeada. |
| `utils/voiceReminder.ts` | Regla de cuándo insistir con el recordatorio. Pura y testeada. |
| `utils/voiceAudio.ts` | El micrófono y la voz, sin nada de la conversación: soltar el micrófono antes de hablar, elegir la voz, reabrir la escucha, pausar ante fallos. Recibe el navegador como dependencias y está testeado con dobles. |
| `hooks/useVoiceChecklist.ts` | El bucle de conversación: decide qué decir y qué esperar oír, la granularidad, los recordatorios y el apagado al completar. Le pasa a `voiceAudio` el reconocedor y la voz del navegador. |
| `components/VoiceChecklistControl.tsx` | Estado visible (escuchando / hablando / apagado / checklist completo), última frase entendida, en qué bloque/actividad va, avisos de pausa, encendido y apagado manual. |
| `components/CleaningTaskChecklist.tsx` | Conecta el hook con las dos acciones del store (`setChecklistItems`, `updateChecklistItem`) y arranca el asistente automáticamente al montar. |

### Por qué las decisiones viven fuera del hook

El proyecto corre sus tests de frontend con `environment: 'node'` (sin jsdom), así que no hay forma de testear el hook completo. Las piezas donde hay algo que se puede equivocar se sacaron del hook para poder probarlas:

- *"¿Esto es un comando?"* y *"¿toca avisar ahora?"* son funciones puras sin navegador (`voiceCommands`, `voiceReminder`).
- *"¿Cuándo se abre el micrófono y cuándo se habla?"* (`voiceAudio`) depende de `SpeechRecognition` y `speechSynthesis`, pero los recibe como dependencias: en los tests se le pasan un reconocedor y una voz falsos, y el reloj falso de Vitest. Los fallos que tuvo en el campo fueron todos de orden y de tiempos, que es justo lo que esos tests fijan.

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
Operario:  "asistente, repite"  → repite solo lo que tiene entre manos:
                                  la actividad en curso ("no") o el
                                  nombre del bloque ("sí"). No reinicia
                                  el reloj ni cambia de modo.

── al marcar lo último (por voz o con el dedo) ────────────
Asistente: "Acabaste todo. Si no tienes novedades, finaliza la tarea."
                              → se apaga solo: suelta el micrófono
                                y la pantalla muestra "Checklist completo"
```

### Apagar el micrófono mientras habla

`say()` siempre detiene el reconocimiento antes de hablar y lo reanuda al terminar. No es una optimización: casi todas las frases del asistente contienen la palabra "acabado" ("Di: asistente, acabado cuando finalices"), y si el teléfono se oyera a sí mismo se daría el trabajo por hecho solo.

El orden importa, y cada paso corrige un fallo visto en Android (`voiceAudio.ts`):

1. **Soltar el micrófono y esperar a que el reconocedor avise que lo soltó** (`abort()` y su `onend`, como máximo 400 ms). Una voz que arranca con el micrófono todavía abierto puede salir muda.
2. **Cancelar lo anterior solo si algo suena.** Un `cancel()` de más llega tarde al motor de voz y se lleva la frase que se pide a continuación.
3. **Respirar 250 ms** si se soltó el micrófono o se canceló algo, y recién entonces hablar.

Además:

- **Turnos.** Cada `say()` abre un turno; lo pendiente de uno anterior (el aviso de una frase cancelada, un temporizador) no hace nada. Sin esto, tocar un bloque mientras el asistente hablaba dejaba viva la lectura vieja: seguía hablando, ejecutaba su `onDone` y reabría el micrófono en mitad de la frase nueva.
- **La frase en curso queda referenciada** mientras suena: Chrome puede liberarla de memoria a media lectura y entonces nunca avisa que terminó.
- **La voz se elige** entre las del dispositivo (`pickSpanishVoice`): de España si la hay, si no cualquier otra en español, y la instalada antes que la de red. Pedir `es-ES` sin elegir voz falla en silencio en motores que no la tienen, como el propio de algunos Samsung.
- **El respaldo crece con la frase** (`speechFallbackMs`: 3 s + 90 ms por carácter) y, si al cumplirse la voz sigue sonando, se espera más, hasta el doble. Con un respaldo fijo de 10 s una actividad larga se daba por dicha a media lectura y el micrófono se abría con el teléfono hablando.
- **Si el navegador no deja hablar** (`not-allowed`: Chrome no deja hablar a una página que nadie tocó todavía, como cuando se recarga sola al volver a la app), el asistente se pausa con `voz-bloqueada`. Un toque en "Intentar de nuevo" lo arregla.

### Configuración del reconocedor

```ts
recognition.continuous = true;
recognition.interimResults = true;
```

`continuous: true` es obligatorio: con `false`, el reconocedor cierra la sesión de escucha en cuanto detecta una pausa, y en la prueba de campo eso hizo perder más de la mitad de lo que el operario decía — cerraba antes de terminar de procesar la transcripción. Con `interimResults: true` el hook actúa sobre resultados **parciales**, no solo sobre el resultado final (que en Chrome móvil suele tardar o no llegar).

### Reabrir el micrófono

En Android, Chrome cierra la escucha tras unos segundos de silencio aunque se pida `continuous`, y en muchos móviles suena un pitido cada vez que el micrófono se abre o se cierra. El asistente lo vuelve a abrir solo; cuándo, lo decide `afterSession` (`voiceAudio.ts`):

- **Tras un silencio normal** (una sesión larga, o una en la que oyó algo): se reabre a los 0,3 s. Esperar más haría que el operario hablara sobre un micrófono cerrado.
- **Tras cortes rápidos seguidos** (menos de 1,5 s sin oír nada, o un error `network`/`audio-capture`): se espacia — 0,3 s, 1 s y 3 s. Oír cualquier cosa vuelve a 0,3 s. Reabrir siempre a los 0,3 s era el bucle de encender y apagar con pitidos varias veces por segundo.
- **Al 4.º corte seguido por `network` o `audio-capture`** el asistente se pausa con `sin-conexion` o `microfono-no-disponible` y lo avisa en pantalla, con "Intentar de nuevo". Los cortes sin un error claro solo se espacian y no pausan: pausar por ellos podría dejar sin asistente a un móvil que simplemente cierra rápido.
- **`not-allowed` / `service-not-allowed`** pausan en el acto (`sin-microfono`), y **`language-not-supported`** también (`sin-soporte`).
- **Con la página oculta** (pantalla apagada, otra app) el navegador corta la escucha: eso no cuenta como fallo ni se reintenta. Al volver a verse la página, se reabre con la cuenta a cero.

Algún pitido mientras espera en silencio es de Android y no se puede quitar desde la web.

### Ciclo de vida y limpieza

- El asistente **arranca automáticamente** al montar `CleaningTaskChecklist` (que solo existe mientras la tarea está en ejecución). No hace falta que el operario lo encienda. **Si al montar ya está todo marcado, no arranca**: no queda nada que guiar.
- **Se apaga solo al completar el checklist**, por voz o con el dedo: dice "Acabaste todo. Si no tienes novedades, finaliza la tarea." y llama a `stop()` en lugar de volver a escuchar. Antes se quedaba escuchando (y pitando) hasta salir de la pantalla. El control muestra "Checklist completo" y oculta el botón de encender mientras siga todo marcado.
- El pedido de permiso de micrófono lo dispara el propio navegador la primera vez que se llama a `recognition.start()` — no hay ningún diálogo propio de la app antes de eso.
- `start()` llama a `unlockSpeechSynthesis()` (ver `speechUnlock.ts`): cuando viene del botón "Encender" o "Intentar de nuevo", corre dentro del toque, que es la única ocasión de destrabar la voz en iOS.
- Si algo impide seguir, el hook expone `failure` y deja de intentar: `"sin-soporte"`, `"sin-microfono"`, `"sin-conexion"`, `"microfono-no-disponible"` o `"voz-bloqueada"`. Salvo `sin-soporte`, el aviso trae "Intentar de nuevo". El checklist sigue funcionando 100% por tap, sin ningún bloqueo.
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

Los tests relevantes a la voz:

| Archivo | Qué cubre |
| --- | --- |
| `voiceCommands.test.ts` | Cada intención y sus variantes; palabra de activación (incluye el caso exacto del bug de campo: *"acabado" suelto → null*, *"asistente, acabado" → FIN*); tope de palabras; que las intenciones fuera de lo esperado se ignoren; que "listo" sea afirmación y nunca fin. |
| `voiceReminder.test.ts` | Primer aviso vs. insistencia; `null` sin minutos; no se rompe con `NaN`/`Infinity`; redondeo de minutos decimales. |
| `voiceAudio.test.ts` | Con un reconocedor y una voz falsos y el reloj de Vitest: que no hable hasta soltar el micrófono (o a los 400 ms); que solo cancele si algo suena, y respire antes de hablar; que una frase nueva anule la anterior (sin seguirla, sin su `onDone`, sin abrir el micrófono); que no abra el micrófono mientras la voz suena; las esperas al reabrir (0,3 / 1 / 3 s) y la pausa al 4.º corte por red o micrófono; la página oculta; la voz bloqueada; el apagado desde `onDone`; la elección de voz. |

La conversación (`useVoiceChecklist`) y el control visual no tienen test automatizado — son React sobre el navegador, y el entorno de test es `node`, sin jsdom. Se verifican a mano.

### Notas de verificación manual

- **Brave no sirve**: no incluye la clave de la API de reconocimiento de voz de Google y falla siempre con error `network` (ahora termina en el aviso "sin conexión"). Probar en Chrome.
- El caso que el bug del "Dime" rompía — decir "asistente, acabado" de corrido, sin pausa — es el primero a reprobar ante cualquier cambio futuro en la ventana de activación.
- Contestar "no" y confirmar que el check del bloque **no aparece** hasta cerrar la última actividad es la prueba de que se está escribiendo por actividad y no por bloque.
- Tocar un bloque mientras el asistente habla: tiene que pasar limpio al siguiente, sin mezclar frases.
- Modo avión mientras escucha: en unos segundos, "Asistente en pausa: sin conexión"; con internet de vuelta, "Intentar de nuevo" lo reanuda.
- Marcar lo último: dice "Acabaste todo…", se apaga y no vuelve a pitar.

---

## 9. Limitaciones conocidas / fuera de alcance

- **No hay reconocimiento en iOS Safari** de forma confiable — es una limitación del navegador, no de esta implementación. El asistente se degrada a `failure: "sin-soporte"` y el checklist sigue por tap.
- **En iOS, una voz sin destrabar se descarta sin ningún aviso**: no hay error que permita pausar con `voz-bloqueada` como en Chrome. Se destraba con el toque de "Iniciar tarea", "Reanudar", "Encender" o "Intentar de nuevo".
- **Los pitidos de Android al reabrir el micrófono tras un silencio** son del sistema y no se pueden quitar desde la web. Lo que sí se evita es el bucle rápido (ver "Reabrir el micrófono").
- **Sin señal sonora de confirmación** en el camino "sí" (bloque). Si el ruido ambiente tapa el "asistente, acabado" y el operario no se da cuenta, es posible que lo repita y ese segundo intento caiga sobre el bloque siguiente. Mitigable a futuro con un sonido corto de confirmación; no implementado en esta versión.
- **El pedido de permiso de micrófono es el del navegador**, sin una pantalla propia previa que explique para qué sirve antes de que aparezca. Se apoya en que el operario ya vio el aviso en la pantalla previa al inicio de la tarea (`CleaningTaskPreStart`, `showVoiceNotice`).
