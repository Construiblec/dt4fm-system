import { downscaleImage } from "@/shared/utils/downscaleImage";

/** Esperas antes de cada reintento; la primera lectura es inmediata. */
export const RETRY_DELAYS_MS = [300, 1000];

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * La foto no se pudo leer ni al elegirla ni reintentando. El mensaje es el que
 * ve el usuario, con el código del navegador entre paréntesis para soporte.
 */
export class UnreadableImageError extends Error {
  readonly fileName: string;
  readonly code: string;

  constructor(fileName: string, code: string) {
    super(
      `No se pudo leer la foto «${fileName}». Vuelve a tomarla o elige otra. (${code})`,
    );
    this.name = "UnreadableImageError";
    this.fileName = fileName;
    this.code = code;
  }
}

type Sleep = (ms: number) => Promise<void>;

const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sin `arrayBuffer` (iOS anterior a 14) queda `FileReader`. */
const readBuffer = (file: Blob): Promise<ArrayBuffer> =>
  typeof file.arrayBuffer === "function"
    ? file.arrayBuffer()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });

/** El tipo, o el que corresponde a la extensión si el móvil lo da vacío. */
const typeOf = (file: File) =>
  file.type ||
  MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ||
  "";

const emptyRead = () => Object.assign(new Error("Lectura vacía"), { name: "EmptyRead" });

/** `NotReadableError`, `NotFoundError`…: lo que dice el navegador, para soporte. */
const codeOf = (error: unknown) =>
  error && typeof error === "object" && "name" in error && typeof error.name === "string"
    ? error.name
    : "Error";

/**
 * Copia la foto a memoria en cuanto se elige.
 *
 * En el móvil, el archivo que entrega el selector no es una copia propia: lo
 * sirve el sistema (galería, cámara, almacenamiento temporal). Si el sistema lo
 * retoca o lo termina de escribir después de elegirlo, el navegador ya no deja
 * leerlo: la miniatura sale en blanco con el nombre del archivo y el envío
 * falla con `ERR_UPLOAD_FILE_CHANGED`, que la app enseñaba como «No se pudo
 * crear el incidente». Leído al momento, lo que se guarda no depende del
 * sistema. Si la primera lectura falla se reintenta: a veces el archivo aún no
 * está listo.
 */
export const readIntoMemory = async (
  file: File,
  wait: Sleep = sleep,
): Promise<File> => {
  // Sale ya, antes de cualquier espera: es la lectura con más opciones.
  let attempt = readBuffer(file);
  let lastError: unknown;

  for (let retry = 0; ; retry += 1) {
    try {
      const buffer = await attempt;

      if (buffer.byteLength > 0) {
        return new File([buffer], file.name, {
          type: typeOf(file),
          lastModified: file.lastModified,
        });
      }

      lastError = emptyRead();
    } catch (error) {
      lastError = error;
    }

    if (retry >= RETRY_DELAYS_MS.length) break;

    await wait(RETRY_DELAYS_MS[retry]);
    attempt = readBuffer(file);
  }

  throw new UnreadableImageError(file.name, codeOf(lastError));
};

/**
 * Lo que se guarda o se sube de una foto recién elegida: la copia en memoria,
 * reducida. Lanza `UnreadableImageError` si no se pudo leer.
 */
export const prepareImage = async (file: File): Promise<File> =>
  downscaleImage(await readIntoMemory(file));

/** Mensaje para el usuario ante cualquier fallo al preparar una foto. */
export const describeImageError = (error: unknown): string =>
  error instanceof UnreadableImageError
    ? error.message
    : "No se pudo preparar la foto. Inténtalo de nuevo.";
