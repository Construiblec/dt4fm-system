const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Data URL de una imagen descargada, para pintarla tal cual en un `<img>`.
 *
 * Si openMAINT no da un `Content-Type` de imagen (a veces responde
 * `application/octet-stream`), se deduce de la extensión del nombre: con un
 * tipo genérico el navegador no la pinta.
 */
export const toImageDataUrl = (
  data: Buffer,
  contentType: string,
  fileName: string,
): string => {
  const mime = contentType.startsWith('image/')
    ? contentType.split(';')[0].trim()
    : (MIME_BY_EXTENSION[fileName.split('.').pop()?.toLowerCase() ?? ''] ??
      'image/jpeg');

  return `data:${mime};base64,${data.toString('base64')}`;
};
