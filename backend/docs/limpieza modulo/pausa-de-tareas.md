# Pausa de Tareas de Limpieza – Backend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Este documento describe el mecanismo de **pausa** de las tareas de limpieza: el empleado interrumpe una tarea en curso indicando un motivo, el tiempo trabajado queda guardado, y más tarde la reanuda continuando el conteo desde donde lo dejó.

Cubre también las dos piezas que hacen falta para que eso funcione de verdad: el **cronómetro compartido** (que sobrevive a recargas y a otros dispositivos) y el **borrador de observaciones** (para que el empleado no pierda lo que llevaba escrito).

---

## 2. La decisión central: OpenMAINT no tiene fase "Paused"

El flujo de trabajo `CleaningTask` en OpenMAINT tiene cinco fases y **ninguna representa una pausa**:

```text
Assigned · InExecution · Completed · Reviewed · Cancelled
```

No se creó una fase nueva a propósito. En su lugar, **pausar devuelve la tarea a `Assigned`**, y el estado de pausa se distingue por una marca escrita en `TeamObservations`.

Esto tiene una consecuencia de diseño que conviene respetar: **el estado de pausa se resuelve en el backend, una sola vez**, en `isPausedTask()`, y se expone como el booleano `isPaused`. Ninguna vista debe leer el texto de las observaciones para deducirlo.

```ts
// La tarea está pausada si volvió a Assigned y la última marca es de pausa.
export const isPausedTask = (task) => {
  if (fase !== 'Assigned') return false;
  return ultimaMarcaPausa > ultimaMarcaReanudacion;
};
```

La transición `InExecution → Assigned` está declarada como válida en `PHASE_TRANSITIONS` justamente para esto.

---

## 3. Las tres marcas de la bitácora

`TeamObservations` funciona como bitácora. Se escriben tres marcas, todas con fecha y hora del evento:

| Marca | Formato | Cuándo |
|---|---|---|
| Pausa | `[Pausado: 2026-08-19 \| 10:20]: se acabó el detergente` | El empleado pausa |
| Reanudación | `[Reanudado: 2026-08-19 \| 10:34]` | Reanuda una tarea pausada |
| Reinicio | `[Reiniciado: 2026-08-19 \| 10:34 \| 25min]` | Arranca una tarea **reabierta** por el supervisor |

**Reanudar y reiniciar no son lo mismo**, y por eso hacen falta dos marcas distintas:

* **Reanudar** una pausa continúa el conteo: el cronómetro parte del tiempo ya trabajado.
* **Reiniciar** una tarea reabierta empieza de cero, y lo que se trabaje se suma a lo que ya había.

La marca de reinicio lleva además **el tiempo que la tarea arrastraba** al reabrirse (`| 25min`). OpenMAINT guarda una sola cifra de tiempo, la total; sin ese número, al pausar y reanudar dentro de una sesión reabierta no habría forma de saber qué parte del acumulado pertenece a la sesión en curso, y el cronómetro reaparecería con el histórico incluido.

> Las marcas se buscan **por prefijo** (`[Pausado`, `[Reanudado`, `[Reiniciado`), así que las notas del formato anterior (`[Pausado]:`) siguen reconociéndose.

---

## 4. El cronómetro vive en OpenMAINT, no en el navegador

El backend calcula dos valores y los expone en cada lectura de la tarea:

| Campo | Qué es |
|---|---|
| `sessionStartedAt` | Instante en que arrancó la ejecución **que está corriendo ahora**. Es el cero del cronómetro. `null` si la tarea no está en ejecución. |
| `sessionBaseMinutes` | Minutos con los que **arranca** el cronómetro. Al reanudar una pausa, el tiempo ya trabajado en esta sesión; al reiniciar, cero. |

Ambos se derivan de las marcas de la bitácora (`resolveSessionStartedAt`, `resolveSessionBaseMinutes`, `resolveSessionCarryMinutes`).

**Por qué en el servidor.** Antes esta información solo existía en el `localStorage` del equipo, así que cada carga de página la reinventaba y el conteo volvía a cero. Al vivir en OpenMAINT, dos ventanas, otro dispositivo o una recarga calculan todas el mismo tiempo transcurrido.

En el primer inicio la referencia la da `ActualStartTime`. A partir del segundo arranque ya no sirve, porque ese campo apunta al inicio histórico: de ahí que la marca de la bitácora sea imprescindible.

---

## 5. El borrador de observaciones

Cuando el empleado pausa, lo que llevara escrito en el campo "Observaciones" se guarda **entre llaves, al final** de `TeamObservations`:

```text
[Pausado: 2026-08-19 | 10:20]: se acabó el detergente {Falta aspirar el cuarto principal}
```

Es un **borrador, no una observación**:

* Se guarda en OpenMAINT para que sobreviva a la pausa y a que el empleado cierre la app.
* **Nunca se muestra** en ninguna vista. El backend siempre devuelve `teamObservations` ya limpio de este bloque (`stripDraftObservations`).
* Se le devuelve al empleado al reanudar, y desaparece al completar la tarea.

Va anclado al final por dos razones: para que el recorte por longitud se coma la bitácora vieja antes que el texto vivo, y para no confundirlo con unas llaves escritas en medio de una observación.

Las llaves que el empleado escriba en el motivo se escapan (`escapeBraces`) para no romper el bloque.

---

## 6. Endpoints

### 6.1. Pausar

```text
PATCH /cleaning-tasks/:taskId/pause
```

Cabeceras: `x-session-token`, `x-cleaning-employee-id`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `reason` | string (máx. 500) | Sí | Motivo de la pausa. Va a la bitácora tras la marca |
| `executionMinutes` | number ≥ 0 | No | Tiempo total trabajado hasta la pausa, medido por el front |
| `draftObservations` | string (máx. 1000) | No | Borrador del campo "Observaciones" |

Respuesta:

```json
{
  "success": true,
  "data": {
    "id": 7328116,
    "phase": "Assigned",
    "isPaused": true,
    "reason": "Falta de insumos, esperando reposición",
    "executionTime": 35
  }
}
```

**`executionMinutes` REEMPLAZA a `ExecutionTime`, no se suma.** Es el acumulado total que trae el front (lo que la tarea ya tenía más lo de esta sesión). Sumarlo produciría un doble conteo.

### 6.2. Reanudar

No hay endpoint propio: **se reanuda con el mismo endpoint de inicio**.

```text
PATCH /cleaning-tasks/:taskId/start
```

`startTask` detecta con `isPausedTask` si venía de una pausa y escribe la marca que corresponde (`[Reanudado]` o `[Reiniciado]`). La respuesta incluye `resumed: true` cuando cerró una pausa.

---

## 7. Flujo completo

```text
        Assigned
           │  PATCH /start        (primer inicio: fija ActualStartTime y DelayTime)
           ▼
      InExecution ──────────────────────────────► Completed
           │  PATCH /pause                            │
           │   · phase → Assigned                     │ PATCH /reopen
           │   · ExecutionTime = total trabajado      │  (limpia ActualEndTime)
           │   · marca [Pausado] + motivo             ▼
           │   · borrador entre llaves            Assigned
           ▼                                          │ PATCH /start
     Assigned  [Pausado]                              │  · marca [Reiniciado | Nmin]
           │  PATCH /start                            ▼
           │   · marca [Reanudado]                InExecution
           │   · devuelve el borrador
           ▼
      InExecution
```

Se puede pausar y reanudar tantas veces como haga falta. Cada ciclo añade su par de marcas a la bitácora.

---

## 8. Validaciones al pausar

| Regla | Comportamiento |
|---|---|
| La tarea debe estar en `InExecution` | 400 – la transición a `Assigned` no es válida desde otra fase |
| No se puede pausar una tarea ya pausada | 400 – `Assigned → Assigned` no es una transición válida, así que queda atajado por la misma regla |
| Debe existir `ActualStartTime` | 400 – "Task must be started before pausing" |
| El motivo es obligatorio | 400 – "Debes indicar el motivo de la pausa" |
| El empleado debe ser el dueño de la tarea | `fetchAndValidateOwnership` |

El tiempo reportado se acota con un tope defensivo de **7 días** (`MAX_TOTAL_EXECUTION_MINUTES`), holgado a propósito porque es un acumulado entre pausas y reaperturas; solo ataja valores absurdos.

---

## 9. Evidencia fotográfica

Las fotos son adjuntos de la tarea en OpenMAINT y **admiten varias**:

| Límite | Valor |
|---|---|
| Máximo de adjuntos por tarea | 10 |
| Tamaño máximo por archivo | 10 MB |
| Formatos | JPEG, PNG, HEIC, HEIF |
| Fases en que se puede subir | `InExecution`, `Completed` |

```text
POST /cleaning-tasks/:taskId/attachments          subir
GET  /cleaning-tasks/:taskId/attachments          listar
GET  /cleaning-tasks/:taskId/attachments/:id/download
```

Como `InExecution` está entre las fases permitidas, el empleado puede documentar el estado en que deja la unidad **antes de pausar**, que es el caso de uso que motivó admitir varias fotos.

Los supervisores acceden por la misma ruta sin la validación de propiedad (`getAttachmentsAsSupervisor`).

---

## 10. Límite de longitud

`TeamObservations` tiene un tope de **500 caracteres**, bitácora y borrador incluidos. Al superarse, el recorte descarta primero lo más antiguo de la bitácora y conserva el texto vivo.

Es una limitación real: en una tarea con muchas pausas, las marcas más viejas se pierden. `isPausedTask` solo necesita la última, así que el estado sigue siendo correcto; lo que se degrada es el historial.

---

## 11. Trampas a tener en cuenta

**No deducir el estado de pausa leyendo el texto.** Usar el booleano `isPaused` que ya viene resuelto. Si algún día se crea una fase real en OpenMAINT, cambiar `isPausedTask` bastaría.

**No sumar `executionMinutes`.** Llega como total acumulado, no como incremento.

**Distinguir reanudar de reiniciar.** Son dos arranques con reglas de cronómetro distintas; tratarlos igual hace que el contador reaparezca con el tiempo histórico incluido.

**El borrador nunca se muestra.** Cualquier lectura nueva de `TeamObservations` debe pasar por `stripDraftObservations`, o el bloque entre llaves acabará visible en alguna vista.
