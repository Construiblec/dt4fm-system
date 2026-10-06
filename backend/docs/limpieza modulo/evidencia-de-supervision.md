# Evidencia de Supervisión en Tareas de Limpieza – Backend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Al revisar una tarea de limpieza, el supervisor puede adjuntar fotos de las novedades que encuentra. Si reabre la tarea, el equipo de limpieza ve esas fotos en su pantalla de ejecución, antes de iniciar y durante la ejecución, y sabe qué tiene que corregir.

Pueden hacerlo los roles de supervisión de limpieza: `SuperUser`, `SupervisorLimpieza` y `AsistenteSL` (`SUPERVISOR_ROLES`).

---

## 2. La decisión central: un adjunto normal con una marca

En OpenMAINT no existe una categoría de adjunto para la supervisión, y no se creó una a propósito. La evidencia se guarda como un adjunto `Photo` normal de la tarjeta `CleaningTask`, igual que las fotos del operario. Lo que la distingue es el **nombre del archivo**, que genera siempre el backend:

```text
supervision_1791204734903_zebb3.jpg   ← evidencia de supervisión
1791204734903_zebb3.jpg               ← foto del operario
```

No se usa la descripción del adjunto porque OpenMAINT la descarta al subir a `CleaningTask`: se comprobó el 2026-10-05 y llegaba vacía. El backend sigue enviando `[Supervisión]` como descripción y la reconoce, por si algún día se guarda.

El operario no puede hacerse pasar por supervisión: su nombre de archivo también lo genera el backend, sin prefijo, y su descripción no se reenvía.

Igual que con la pausa, **el origen se resuelve en el backend, una sola vez**, en `resolveAttachmentOrigin()`. Cada adjunto, tanto en el detalle (`GET /cleaning-tasks/:taskId`) como en el listado (`GET /cleaning-tasks/:taskId/attachments`), trae:

```ts
origin: 'supervision' | 'execution'
```

Ninguna vista debe leer la descripción para deducirlo.

---

## 3. Endpoints

| Método | Ruta | Quién |
|---|---|---|
| `POST` | `/cleaning-tasks/:taskId/supervision-evidence` | Supervisión (`multipart/form-data`, campo `file`) |
| `DELETE` | `/cleaning-tasks/:taskId/supervision-evidence/:attachmentId` | Supervisión |

El rol se resuelve contra la sesión de OpenMAINT (`requireSupervisorRole`), no contra la cabecera `x-role`. Un rol que no es de supervisión recibe `403`.

---

## 4. Reglas

- **Fases:** solo con la tarea `Completed` o `Reviewed`, las mismas en las que se puede reabrir (`canReopen`). En cualquier otra fase, `400`.
- **Archivo:** las mismas reglas que las fotos del operario: JPG, PNG o HEIC, de hasta 10MB.
- **Tope propio:** 10 fotos de evidencia por tarea (`MAX_SUPERVISION_EVIDENCE`). Las fotos del operario tienen su propio tope de 10, y ninguno de los dos cuenta las del otro.
- **Borrado:**
  - El supervisor solo puede borrar evidencia de supervisión. Si intenta borrar una foto del operario, recibe `403`.
  - El operario no puede borrar la evidencia de supervisión, aunque la tarea sea suya. Recibe `403`.

---

## 5. Frontend

- **Supervisor y Asistente SL:** en el detalle de la tarea, `SupervisionEvidenceSection` va debajo de "Evidencia fotográfica", donde están las fotos del operario. Con la tarea `Completed` o `Reviewed` se pueden añadir y borrar fotos; en las demás fases solo se ven.
- **Operario:** `SupervisionEvidenceGallery`, en solo lectura, aparece en dos momentos:
  - Antes de iniciar una tarea reabierta, junto con las observaciones de supervisión.
  - Durante la ejecución.

  La sección de fotos propias (`CleaningTaskPhotoUpload`) no cuenta ni deja borrar la evidencia de supervisión.
