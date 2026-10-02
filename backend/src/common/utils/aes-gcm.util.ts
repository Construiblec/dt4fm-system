import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM con el formato `iv:tag:texto` en base64url.
 *
 * Lo comparten el PIN de accesos y las sesiones recordadas: mismo algoritmo,
 * claves distintas. GCM autentica además de cifrar, así que un texto
 * manipulado no descifra a basura sino que lanza.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export const AES_KEY_BYTES = 32;

export const encryptAesGcm = (key: Buffer, plaintext: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
};

/** `label` nombra lo cifrado en el error de formato («PIN cifrado»…). */
export const decryptAesGcm = (
  key: Buffer,
  payload: string,
  label: string,
): string => {
  const parts = (payload ?? '').split(':');

  if (parts.length !== 3) {
    throw new Error(`Formato de ${label} inválido`);
  }

  const [iv, tag, ciphertext] = parts.map((part) =>
    Buffer.from(part, 'base64url'),
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  // GCM detecta manipulación aquí: final() lanza si el tag no cuadra.
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
};
