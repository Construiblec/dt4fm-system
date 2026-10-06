/**
 * Evidencia de supervisión: fotos que el supervisor adjunta a una tarea de
 * limpieza al revisarla, para documentar las novedades que encuentra.
 *
 * En openMAINT son adjuntos `Photo` normales de la tarjeta, igual que los del
 * operario. Lo que las distingue es el **nombre del archivo**, que genera siempre
 * el backend con el prefijo `supervision_`: el del operario nunca lo lleva.
 *
 * Se usa el nombre y no la descripción porque openMAINT descarta la descripción
 * al subir un adjunto a `CleaningTask` (comprobado el 2026-10-05: llegaba vacía).
 * La marca en la descripción se sigue enviando y reconociendo por si algún día
 * se guarda.
 */
export const SUPERVISION_EVIDENCE_FILE_PREFIX = 'supervision_';
export const SUPERVISION_EVIDENCE_TAG = '[Supervisión]';

/**
 * Fases en que el supervisor puede añadir o borrar evidencia. Son las mismas en
 * que puede reabrir la tarea: la evidencia acompaña a esa decisión.
 */
export const SUPERVISION_EVIDENCE_PHASES = ['Completed', 'Reviewed'];

/** Tope propio: no comparte cupo con las fotos del operario. */
export const MAX_SUPERVISION_EVIDENCE = 10;

export type AttachmentOrigin = 'supervision' | 'execution';

type AttachmentLike = {
  name?: string | null;
  fileName?: string | null;
  description?: string | null;
};

export const isSupervisionEvidence = (attachment: AttachmentLike) =>
  Boolean(
    (attachment.name ?? attachment.fileName)?.startsWith(
      SUPERVISION_EVIDENCE_FILE_PREFIX,
    ) || attachment.description?.startsWith(SUPERVISION_EVIDENCE_TAG),
  );

export const resolveAttachmentOrigin = (
  attachment: AttachmentLike,
): AttachmentOrigin =>
  isSupervisionEvidence(attachment) ? 'supervision' : 'execution';
