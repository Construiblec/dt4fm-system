import { BadRequestException } from '@nestjs/common';

/** Tipo mínimo del archivo subido por multer (evita dependencia de @types/multer). */
export type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export const ALLOWED_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];

export const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

/** Mismas reglas para las fotos del operario y las de las novedades. */
export const assertValidPhoto = (file: UploadedFile): void => {
  if (!ALLOWED_PHOTO_MIME_TYPES.includes(file.mimetype))
    throw new BadRequestException(
      'Only jpg, jpeg, png, heic files are allowed',
    );
  if (file.size > MAX_PHOTO_SIZE_BYTES)
    throw new BadRequestException('File size must not exceed 10MB');
};

/**
 * Nombre que genera el backend: openMAINT rechaza dos adjuntos con el mismo
 * nombre en una tarjeta, y el prefijo distingue el origen de la foto.
 */
export const buildUniqueFileName = (
  file: UploadedFile,
  prefix = '',
): string => {
  const ext = file.originalname.includes('.')
    ? file.originalname.split('.').pop()
    : 'jpg';
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
};
