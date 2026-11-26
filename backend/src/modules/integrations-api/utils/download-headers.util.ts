const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

const FALLBACK_NAME = 'archivo';
const MAX_NAME_LENGTH = 200;

export const safeContentType = (contentType: string | null | undefined) => {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();

  return ALLOWED_TYPES.has(type) ? type : 'application/octet-stream';
};

/** `filename*` de RFC 5987: todo queda en ASCII, así que no cabe inyectar cabeceras. */
export const attachmentDisposition = (fileName: string | null): string => {
  const clean = [
    ...(fileName ?? '')
      .replace(/\p{Cs}/gu, '�')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/[/\\]/g, '_')
      .trim(),
  ]
    .slice(-MAX_NAME_LENGTH)
    .join('');

  const encoded = encodeURIComponent(clean || FALLBACK_NAME).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename*=UTF-8''${encoded}`;
};
