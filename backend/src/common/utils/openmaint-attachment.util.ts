import type { Response } from 'express';

/** Adjunto tal como lo devuelve OpenMAINT, sea de proceso o de clase. */
export type RawOpenmaintAttachment = {
  _id: string;
  name?: string;
  fileName?: string;
  category?: string;
  _category_description?: string;
  description?: string;
  author?: string;
  created?: string;
  modified?: string;
};

/** Contrato público de un archivo adjunto. */
export type MaintenanceAttachment = {
  id: string;
  fileName: string;
  category: string | null;
  description: string | null;
  uploadDate: string | null;
  /** Ruta de este mismo backend, no de OpenMAINT */
  downloadUrl: string;
  isImage: boolean;
  /** Lo generó OpenMAINT al cerrar, no lo adjuntó un usuario */
  isReport: boolean;
};

export type DownloadedFile = {
  data: Buffer;
  contentType: string;
  fileName: string;
};

const IMAGE_FILE_REGEX = /\.(png|jpe?g|webp|heic|heif)$/i;

/** Respaldo para reconocer el informe cuando la instancia no tiene número. */
const GENERATED_REPORT_REGEX = /informe de actividades/i;

export const toMaintenanceAttachment = (
  attachment: RawOpenmaintAttachment,
  downloadUrl: string,
  isReport = false,
): MaintenanceAttachment => {
  // Los adjuntos de proceso traen `fileName`; los de clase, `name`
  const fileName = attachment.fileName ?? attachment.name ?? 'adjunto';

  return {
    id: attachment._id,
    fileName,
    category: attachment._category_description ?? attachment.category ?? null,
    description: attachment.description ?? null,
    uploadDate: attachment.created ?? attachment.modified ?? null,
    downloadUrl,
    isImage: IMAGE_FILE_REGEX.test(fileName),
    isReport,
  };
};

/**
 * El informe que OpenMAINT genera al cerrar lleva el número del proceso al
 * inicio de la descripción: `[MC.2026.0012] Informe de actividades ...`.
 */
export const isGeneratedReport = (
  attachment: RawOpenmaintAttachment,
  number: string | null,
): boolean => {
  const description = attachment.description ?? '';

  return number
    ? description.startsWith(`[${number}]`)
    : GENERATED_REPORT_REGEX.test(attachment.fileName ?? attachment.name ?? '');
};

/** OpenMAINT devuelve el nombre form-encoded en el `Content-Disposition`. */
export const decodeAttachmentFileName = (fileName: string): string => {
  try {
    return decodeURIComponent(fileName.replace(/\+/g, ' '));
  } catch {
    return fileName;
  }
};

export const sendDownloadedFile = (res: Response, file: DownloadedFile) => {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${decodeAttachmentFileName(file.fileName)}"`,
  );
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(file.data);
};

export const getHttpErrorStatus = (error: unknown): number | undefined => {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'status' in error.response &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  return undefined;
};
