/**
 * Lector de la plantilla CSV en bytes, para revisar el archivo ANTES de subirlo.
 *
 * Es una copia de `backend/src/modules/cleaning-tasks/utils/csv-template.util.ts`
 * (Buffer de Node → Uint8Array) y debe seguir igual: lo que aquí se acepta es lo
 * que el backend va a aceptar, y lo que aquí se lee es lo que va a ver el
 * equipo. Si el original cambia, este archivo queda desactualizado.
 */

/** Tope defensivo. Una plantilla real pesa unos pocos KB. */
export const MAX_TEMPLATE_BYTES = 1024 * 1024;

const BOM = String.fromCharCode(0xfeff);
const REPLACEMENT = String.fromCharCode(0xfffd);

const BINARY_SIGNATURES: { bytes: number[]; label: string }[] = [
  { bytes: [0x50, 0x4b, 0x03, 0x04], label: "xlsx/ods" },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], label: "xls" },
  { bytes: [0x25, 0x50, 0x44, 0x46], label: "pdf" },
];

export type CsvEncoding = "utf-8" | "utf-16" | "windows-1252";

export type CsvTemplateResult =
  | { ok: true; rows: string[]; encoding: CsvEncoding }
  | {
      ok: false;
      /** Para elegir el mensaje de la interfaz. */
      code: "empty" | "too-big" | "binary" | "no-rows";
      label?: string;
      /** El texto del backend, tal cual. */
      reason: string;
    };

const startsWith = (buffer: Uint8Array, bytes: number[]) =>
  bytes.every((byte, index) => buffer[index] === byte);

/** Igual que `buffer.toString('latin1')` de Node: un byte, un carácter. */
const decodeLatin1 = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 4096) {
    out += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return out;
};

const decodeText = (
  buffer: Uint8Array,
): { text: string; encoding: CsvEncoding } => {
  if (buffer.length >= 2 && buffer.length % 2 === 0) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return {
        text: new TextDecoder("utf-16le").decode(buffer.subarray(2)),
        encoding: "utf-16",
      };
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return {
        text: new TextDecoder("utf-16be").decode(buffer.subarray(2)),
        encoding: "utf-16",
      };
    }
  }

  const body = startsWith(buffer, [0xef, 0xbb, 0xbf])
    ? buffer.subarray(3)
    : buffer;

  // UTF-8 inválido produce U+FFFD: esa es la señal de que eran bytes de Excel.
  const utf8 = new TextDecoder("utf-8", { ignoreBOM: true }).decode(body);
  if (utf8.includes(REPLACEMENT)) {
    return { text: decodeLatin1(body), encoding: "windows-1252" };
  }

  return { text: utf8, encoding: "utf-8" };
};

/** Una fila lógica por elemento: un salto de línea dentro de comillas no corta la fila. */
const toLogicalRows = (text: string): string[] => {
  const rows: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (const char of text) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
      current += char;
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (insideQuotes) {
        current += " ";
      } else {
        if (current.trim()) rows.push(current.trim());
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.trim()) rows.push(current.trim());

  // Comilla sin cerrar: se vuelve a partir por líneas para no perder el resto del archivo.
  if (insideQuotes) {
    return text
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return rows;
};

export const readCsvTemplate = (buffer: Uint8Array): CsvTemplateResult => {
  if (buffer.length === 0) {
    return { ok: false, code: "empty", reason: "la plantilla llegó vacía" };
  }

  if (buffer.length > MAX_TEMPLATE_BYTES) {
    return {
      ok: false,
      code: "too-big",
      reason: `la plantilla pesa ${buffer.length} bytes, por encima del máximo de ${MAX_TEMPLATE_BYTES}`,
    };
  }

  const binary = BINARY_SIGNATURES.find((signature) =>
    startsWith(buffer, signature.bytes),
  );
  if (binary) {
    return {
      ok: false,
      code: "binary",
      label: binary.label,
      reason: `la plantilla es un archivo ${binary.label}, no un CSV: hay que exportarla como CSV`,
    };
  }

  const { text, encoding } = decodeText(buffer);
  const rows = toLogicalRows(
    text.startsWith(BOM) ? text.slice(BOM.length) : text,
  );

  if (rows.length === 0) {
    return {
      ok: false,
      code: "no-rows",
      reason: "la plantilla no tiene ninguna fila con contenido",
    };
  }

  return { ok: true, rows, encoding };
};

const FILE_MESSAGES: Record<string, string> = {
  empty: "El archivo está vacío.",
  "too-big": "El archivo pesa más de 1 MB.",
  "no-rows": "El archivo no tiene ninguna fila con contenido.",
};

const BINARY_MESSAGES: Record<string, string> = {
  "xlsx/ods":
    "El archivo es un Excel (.xlsx u .ods), no un CSV. En Excel usa «Guardar como» y elige «CSV (delimitado por comas)».",
  xls: "El archivo es un Excel antiguo (.xls), no un CSV. Guárdalo como «CSV (delimitado por comas)».",
  pdf: "El archivo es un PDF, no un CSV.",
};

/** Mensaje para quien subió el archivo. */
export const describeCsvError = (
  result: Extract<CsvTemplateResult, { ok: false }>,
): string =>
  (result.code === "binary" && result.label
    ? BINARY_MESSAGES[result.label]
    : FILE_MESSAGES[result.code]) ?? result.reason;
