# Ejecución de un correctivo: iniciar y finalizar

Los dos endpoints con los que el técnico mueve su propio trabajo:

| Método | Ruta                     | Efecto en openMAINT                                     |
| ------ | ------------------------ | ------------------------------------------------------- |
| POST   | `/incidents/:id/start`   | Sella `ExecStartDate`. **No** avanza el flujo            |
| POST   | `/incidents/:id/complete`| `CM03-Advance` con `ExecEndDate` → deja en contabilidad  |

Ambos van con `Authorization: <sessionId>`, la sesión de openMAINT del propio técnico.

---

## 1. Por qué hace falta un «Iniciar»

`CorrectiveMaint` no tiene un paso «asignado pero sin empezar». Cuando el supervisor asigna,
`CM02-Advance` deja la instancia directamente en `CM-Execution`, y openMAINT rellena
`ExecStartDate` copiando la fecha *prevista*. El técnico vería una hora de inicio que no puso.

El módulo de supervisión vacía ese campo al asignar (`clearAutoFilledExecStart`), y a partir de ahí
**la fecha de inicio es el dato que distingue los dos estados**:

| `ExecStartDate` | `ExecEndDate` | Estado que ve el técnico |
| --------------- | ------------- | ------------------------ |
| vacío           | vacío         | **Asignado**             |
| con valor       | vacío         | **Ejecución**            |
| con valor       | con valor     | cerrado (contabilidad)   |

La regla vive en `resolveCorrectiveStatus` y la comparten supervisión e incidentes, para que los dos
roles no puedan discrepar sobre el mismo trabajo.

`Assigned` es sintético: no existe en openMAINT y nunca se le envía.

---

## 2. `POST /incidents/:id/start`

Escribe `ExecStartDate` con la hora del servidor mediante un PUT con **`_advance: false`** — el
equivalente al botón «Guardar» de openMAINT. No hay transición que ejecutar: el correctivo ya está
en CM03 desde que se asignó; lo único que falta es la marca de tiempo.

**Es idempotente.** Si ya hay inicio no se pisa: reescribirlo acortaría la duración ya registrada.

```jsonc
// 201 — primera vez
{
  "success": true,
  "alreadyStarted": false,
  "statusCode": "Execution",
  "execStartDate": "2026-08-24T15:55:45.855Z",
  "message": "Trabajo iniciado correctamente"
}

// 201 — ya estaba en marcha; devuelve el inicio original
{
  "success": true,
  "alreadyStarted": true,
  "statusCode": "Execution",
  "execStartDate": "2026-08-24T15:55:45.855Z",
  "message": "El trabajo ya estaba iniciado"
}
```

| Caso                                   | Respuesta                                                     |
| -------------------------------------- | ------------------------------------------------------------- |
| Sin cabecera `authorization`           | 400                                                           |
| El correctivo no está en «Asignado»    | 400 `Solo se puede iniciar un incidente asignado y pendiente…` |
| El incidente no existe                 | 404                                                           |
| Falla openMAINT                        | 502                                                           |

---

## 3. `POST /incidents/:id/complete`

`multipart/form-data` con `notes` y `file` opcionales. Avanza `CM03-Advance`, con lo que el trabajo
cae en `CM-Accounting`, a la espera de la revisión del supervisor.

**Antes de llamar a openMAINT comprueba que haya inicio.** Sin `ExecStartDate` no hay duración que
registrar, así que responde 400 `Hay que iniciar el trabajo antes de finalizarlo`.

El cuerpo que se manda:

```jsonc
{
  "_id": 8016889,
  "_type": "CorrectiveMaint",
  "_activity": "<_tasklist[0]._id>",
  "_advance": true,
  "Action": 261335,                          // CM03-Advance, ID numérico
  "Outcome": 261326,                         // cierre satisfactorio
  "ExecEndDate": "2026-08-24T15:55:50.564Z", // fin real
  "ProcessNotes": "…"
}
```

La evidencia y la notificación de cierre van **después** del avance y son best-effort: si fallan se
registran en el log, pero el trabajo ya quedó cerrado.

---

## 4. Dos trampas de la API, verificadas contra el clon

Las dos salieron de sondear `CM.2026.0152` (8016889) el 2026-08-24 y explican por qué el código se
escribe así.

**`Action` va como ID numérico, no como código.** Con la cadena `'CM03-Advance'` openMAINT guarda
`Action: null` y aplica la transición por defecto del paso. Aquí coincide, pero el parte queda sin
la acción registrada.

**La API no valida `mandatory` ni `writable`.** El paso CM03 los declara así:

```
Action         writable=true  mandatory=true
ExecStartDate  writable=true  mandatory=true
ExecEndDate    writable=true  mandatory=true
Outcome        writable=true  mandatory=false
Assignee       writable=true  mandatory=false
```

…y aun así el `_advance` **avanza sin las fechas**: el trabajo se cierra con `ExecStartDate` y
`ExecEndDate` a `null` y el supervisor no ve ninguna duración. Esas reglas solo las aplica la
interfaz de openMAINT.

Lo mismo con `writable`: consultado por un usuario que no es el cesionario, el `_tasklist` viene con
`writable: false`, pero el PUT se aplica igual. **Ninguna de las dos comprobaciones sirve como
control de acceso**; el corte tiene que estar en el backend, que es lo que hacen la validación de
estado de `startIncident` y la de inicio de `completeIncident`.

---

## 5. Recorrido comprobado

Con la sesión de `wilmer.palma` (rol `MaintOffice`) contra el backend y el clon, sobre
`CM.2026.0152`. El registro se devolvió a su estado original al terminar
(`CM05-Back` → `CM02-Advance` → vaciar `ExecStartDate`).

| Paso                        | Resultado                                                       |
| --------------------------- | --------------------------------------------------------------- |
| `complete` sin haber iniciado | 400, y openMAINT sin tocar                                     |
| `start`                     | 201, `ExecStartDate` sellado, estado → `Execution`               |
| `start` otra vez            | 201 `alreadyStarted: true`, misma fecha                          |
| `GET /incidents/:id`        | `statusCode: "Execution"`                                        |
| `complete`                  | 201, `CM-Accounting` con inicio y fin → duración visible         |
