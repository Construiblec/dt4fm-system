/**
 * Convierte los BYTES de una plantilla CSV (el archivo que vive en el DMS de
 * openMAINT) en las mismas filas de texto que hoy salen de `Detalle`.
 *
 * El contrato de salida es deliberadamente idéntico al del campo de texto
 * (`string[]`, una fila lógica por elemento): así el parser del frontend
 * (`cleaningChecklistUtils.ts`) y sus tests siguen valiendo sin tocar nada, y el
 * origen del checklist —archivo o campo de texto— deja de importar aguas abajo.
 *
 * Todo lo feo pasa acá, porque el archivo lo produce una persona con Excel:
 * BOM, Windows-1252, saltos de línea dentro de comillas y .xlsx disfrazado.
 */

/** Tope defensivo. Una plantilla real pesa unos pocos KB. */
const MAX_TEMPLATE_BYTES = 1024 * 1024;

/**
 * Se construyen por código y no como literales: pegados en el fuente son
 * caracteres invisibles que cualquier editor puede comerse sin que se note, y
 * eslint los rechaza dentro de comentarios y expresiones regulares.
 *
 * - BOM (U+FEFF): la marca de orden de bytes que Excel antepone al archivo.
 * - REPLACEMENT (U+FFFD): lo que Node deja donde había UTF-8 inválido.
 */
const BOM = String.fromCharCode(0xfeff);
const REPLACEMENT = String.fromCharCode(0xfffd);

/** Cuando el archivo se sube por error en otro formato, esto lo delata. */
const BINARY_SIGNATURES: { bytes: number[]; label: string }[] = [
  // Excel moderno y LibreOffice son ZIP por dentro. Es el error más probable:
  // "Guardar como" deja .xlsx si no se elige el tipo CSV a mano.
  { bytes: [0x50, 0x4b, 0x03, 0x04], label: 'xlsx/ods' },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], label: 'xls' },
  { bytes: [0x25, 0x50, 0x44, 0x46], label: 'pdf' },
];

export type CsvTemplateEncoding = 'utf-8' | 'utf-16' | 'windows-1252';

export type CsvTemplateResult =
  | { ok: true; rows: string[]; encoding: CsvTemplateEncoding }
  | { ok: false; reason: string };

const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  bytes.every((byte, index) => buffer[index] === byte);

/**
 * Decodifica a texto adivinando la codificación, porque nadie la declara.
 *
 * Excel en español guarda "CSV (delimitado por comas)" en Windows-1252, no en
 * UTF-8: leerlo como UTF-8 convierte "Baño" en un carácter de reemplazo. Como
 * UTF-8 inválido produce justamente U+FFFD, su presencia es la señal de que los
 * bytes no eran UTF-8.
 *
 * Nota: se usa latin1 (ISO-8859-1) porque Node no trae cp1252. Difieren solo en
 * 0x80-0x9F (comillas tipográficas); las vocales acentuadas y la ñ son idénticas.
 */
const decodeText = (
  buffer: Buffer,
): { text: string; encoding: CsvTemplateEncoding } => {
  // UTF-16 con BOM: es lo que deja "Texto Unicode" en el diálogo de Excel.
  if (buffer.length >= 2 && buffer.length % 2 === 0) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return {
        text: buffer.subarray(2).toString('utf16le'),
        encoding: 'utf-16',
      };
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      // Node no decodifica UTF-16BE: se invierten los pares y se lee como LE.
      const swapped = Buffer.from(buffer.subarray(2));
      swapped.swap16();
      return { text: swapped.toString('utf16le'), encoding: 'utf-16' };
    }
  }

  // El BOM de UTF-8 hay que sacarlo por bytes: si sobrevive al decode se pega a
  // la primera celda y rompe tanto la detección de encabezado como el primer
  // título de sección.
  const body = startsWith(buffer, [0xef, 0xbb, 0xbf])
    ? buffer.subarray(3)
    : buffer;

  const utf8 = body.toString('utf8');
  if (utf8.includes(REPLACEMENT)) {
    return { text: body.toString('latin1'), encoding: 'windows-1252' };
  }

  return { text: utf8, encoding: 'utf-8' };
};

/**
 * Corta el texto en filas LÓGICAS de CSV: un salto de línea dentro de comillas
 * pertenece a la celda y no abre una fila nueva.
 *
 * Importa más que antes. Mientras el checklist se escribía a mano en un campo de
 * texto, una celda multilínea era rarísima; en un archivo hecho en Excel, un
 * Alt+Enter dentro de una actividad la produce sin que nadie lo note, y cortar
 * ahí partiría la actividad en dos filas basura.
 */
const toLogicalRows = (text: string): string[] => {
  const rows: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (const char of text) {
    if (char === '"') {
      // Las comillas escapadas ("") alternan dos veces y se cancelan solas.
      insideQuotes = !insideQuotes;
      current += char;
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (insideQuotes) {
        // El salto es parte de la celda. Se aplana a un espacio: la actividad se
        // pinta en una sola línea y un salto crudo no aportaría nada.
        current += ' ';
      } else {
        if (current.trim()) rows.push(current.trim());
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.trim()) rows.push(current.trim());

  // Comillas sin cerrar: el pegado de arriba no es confiable (puede haber unido
  // medio archivo en una fila). Se vuelve al corte ingenuo, que es exactamente
  // lo que hace hoy el camino de `Detalle` y que el parser del frontend ya sabe
  // tolerar descartando filas basura.
  if (insideQuotes) {
    return text
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return rows;
};

/**
 * Punto de entrada. Nunca lanza: devuelve el motivo del rechazo para que quien
 * llama pueda caer al campo `Detalle` y dejar el porqué en el log.
 */
export const readCsvTemplate = (
  buffer: Buffer | null | undefined,
): CsvTemplateResult => {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: 'la plantilla llegó vacía' };
  }

  if (buffer.length > MAX_TEMPLATE_BYTES) {
    return {
      ok: false,
      reason: `la plantilla pesa ${buffer.length} bytes, por encima del máximo de ${MAX_TEMPLATE_BYTES}`,
    };
  }

  const binary = BINARY_SIGNATURES.find((signature) =>
    startsWith(buffer, signature.bytes),
  );
  if (binary) {
    return {
      ok: false,
      reason: `la plantilla es un archivo ${binary.label}, no un CSV: hay que exportarla como CSV`,
    };
  }

  const { text, encoding } = decodeText(buffer);
  // Respaldo por si algún BOM sobrevivió al decode: acá ya no llega a la celda.
  const rows = toLogicalRows(
    text.startsWith(BOM) ? text.slice(BOM.length) : text,
  );

  if (rows.length === 0) {
    return {
      ok: false,
      reason: 'la plantilla no tiene ninguna fila con contenido',
    };
  }

  return { ok: true, rows, encoding };
};
