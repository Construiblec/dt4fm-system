# Alarmas IoT → Mantenimiento Correctivo

Contrato entre el servidor Raspberry que monitorea los dispositivos IoT y el backend de DT4FM.

El motor de reglas vive en la Raspberry: decide **cuándo** hay una alarma (umbrales, histéresis,
ausencia de señal). El backend solo la traduce a un mantenimiento correctivo en openMAINT y avisa
al supervisor.

---

## Endpoint

```http
POST /iot/alarms
Content-Type: application/json
X-IoT-Secret: <secreto compartido>
```

El secreto se acuerda fuera de banda y viaja en cada petición. Sin cabecera válida la respuesta
es `401`; si el backend no tiene el secreto configurado, `503`.

## Cuerpo

```json
{
  "building": "EDIFICIO",
  "place": "LUGAR",
  "event": "EVENTO",
  "device": "NOMBRE DISPOSITVO",
  "psi": 000,
  "timestamp": "HORA",
  "message": "DESCRIPCIÓN",
  "assetCode": "CÓDIGO ACTIVO OPENMAINT"
}
```

### Campos obligatorios

| Campo | Descripción |
|---|---|
| `assetCode` | `Code` del activo en openMAINT. **Es el único enlace con el sistema de mantenimiento** |
| `event` | Tipo de alarma según el motor de reglas |
| `timestamp` | Momento de detección, ISO 8601 con zona horaria |

### Campos opcionales

| Campo | Uso |
|---|---|
| `message` | Texto legible; encabeza el asunto del correctivo |
| `device` | Identificador del dispositivo emisor |
| *cualquier otro* | Se conserva íntegro en las notas del correctivo |

Los campos de medición (`psi`, y los que hagan falta para otras alarmas) **no necesitan
coordinarse con el backend**: se aceptan y se registran tal cual. Se pueden añadir sin desplegar
nada.

`building` y `place` se guardan como contexto pero **no determinan la ubicación**: esa se deriva
del activo en openMAINT, que es la fuente de verdad.

## Respuestas

| Código | Significado |
|---|---|
| `201` | Correctivo abierto. El cuerpo trae `number` (p. ej. `CM.2026.0150`) |
| `400` | Falta un campo obligatorio o el formato es inválido |
| `401` | Secreto inválido o ausente |
| `502` | openMAINT no aceptó la alarma tras los reintentos |
| `503` | El webhook no está configurado en el backend |

```json
{
  "incidentId": 8192982,
  "number": "CM.2026.0150",
  "assetResolved": true,
  "assetId": 3209930
}
```

`assetResolved: false` avisa de que el `assetCode` no se pudo enlazar; el correctivo se creó
igual (ver más abajo).

---

## Registro del `assetCode` en los dispositivos

Cada dispositivo debe llevar grabado el `Code` del activo de openMAINT al que vigila,
**exactamente** como figura allí (`CAL 01`, `BOMB`, `SPR-1`…).

El backend resuelve ese código contra la superclase `Asset` de openMAINT y hereda del activo su
`Building` y su `Floor`. Por eso la ubicación no se envía desde la Pi.

Tres desenlaces posibles:

| Caso | Qué hace el backend |
|---|---|
| El código corresponde a un activo | Cuelga el correctivo del activo y hereda su ubicación |
| El código no existe | Crea el correctivo igual, sin activo, en el edificio de respaldo, y lo avisa en las notas |
| El código corresponde a varios activos | Igual que el anterior, con los candidatos listados en las notas |

Nunca se descarta una alarma por un problema de datos: perder un aviso es peor que registrar un
correctivo sin equipo asociado. Pero mientras un código esté duplicado o mal escrito, **el
correctivo no quedará enlazado al equipo** y se pierde el historial por activo.

> El `Code` no es único a nivel de esquema en openMAINT. Mantenerlo único es disciplina
> operativa: conviene revisarlo al dar de alta activos nuevos.

---

## Entrega y reintentos

La Raspberry envía cada alarma **una sola vez** y no reintenta. El backend insiste por ella
(`IOT_CREATE_MAX_ATTEMPTS`, 3 por defecto) ante fallos de red o errores 5xx de openMAINT; ante un
4xx no reintenta, porque no mejoraría.

Si aun así falla, responde `502` y **deja el cuerpo íntegro en su log de error**: esa es la única
copia que queda. No hay cola ni reproceso automático.

Conviene que la Pi registre de su lado el resultado de cada envío, para poder reconstruir lo que
no llegó.

---

## Qué se crea en openMAINT

Un proceso `CorrectiveMaint` que arranca en `CM01-Opening` y avanza a `CM-Assignment`, quedando a
la espera de que un supervisor lo asigne — igual que un reporte manual.

| Atributo | Valor |
|---|---|
| `Requester` | Employee "Iot Sistema" |
| `Priority` | `Critical` |
| `Site` / `Floor` | Heredados del activo |
| `Asset` | El activo resuelto |
| `ShortDescr` | `[IoT] <message> - <activo>` |
| `ProcessNotes` | El cuerpo recibido, campo por campo |

Al abrirse se envía una notificación push a los supervisores de mantenimiento:
*"Sistema IoT ha reportado un problema en …"*.

**El valor volviendo a normal no cierra el correctivo.** El cierre es siempre una decisión humana
dentro del flujo de openMAINT.

---

## Configuración del backend

Ver la sección "Alarmas IoT" de `backend/.env.example`.

| Variable | Para qué |
|---|---|
| `IOT_WEBHOOK_SECRET` | Secreto compartido con la Raspberry |
| `OPENMAINT_IOT_REQUESTER_ID` | Employee que figura como solicitante |
| `OPENMAINT_IOT_FALLBACK_SITE_ID` | Edificio de respaldo cuando el activo no resuelve |
| `IOT_CREATE_MAX_ATTEMPTS` | Reintentos ante fallo de openMAINT |
