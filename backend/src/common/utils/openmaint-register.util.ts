const ENTRY_SPLIT_REGEX = /<div[^>]*class="opm_register_entry"[^>]*>/;

const NOTES_BLOCK_REGEX =
  /<span[^>]*data-block="notes"[^>]*>([\s\S]*?)<\/span>/g;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

const MONTHS: Record<string, string> = {
  jan: '01',
  ene: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  abr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  ago: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
  dic: '12',
};

/** Texto plano de un bloque: sin etiquetas, conservando los saltos de línea. */
const toText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const readBlock = (html: string, name: string): string | null => {
  const match = new RegExp(
    `<span[^>]*data-block="${name}"[^>]*>([\\s\\S]*?)</span>`,
  ).exec(html);

  return match ? toText(match[1]) || null : null;
};

/** "12 Oct 2026" + "14:12" → "2026-10-12T14:12:00", en hora local de OpenMAINT. */
const toLocalIso = (
  date: string | null,
  time: string | null,
): string | null => {
  const parts = /^(\d{1,2})\s+([A-Za-zÁ-ú]{3})[^\s]*\s+(\d{4})$/.exec(
    date ?? '',
  );
  const month = parts ? MONTHS[parts[2].toLowerCase()] : undefined;

  if (!parts || !month || !/^\d{2}:\d{2}$/.test(time ?? '')) {
    return null;
  }

  return `${parts[3]}-${month}-${parts[1].padStart(2, '0')}T${time}:00`;
};

/**
 * Notas de la bitácora (`Register`) de un proceso de OpenMAINT, de la más
 * antigua a la más reciente. Un paso sin nota no aporta ninguna.
 */
const readNotes = (register: string | null): string[] =>
  register
    ? [...register.matchAll(NOTES_BLOCK_REGEX)].map((match) => toText(match[1]))
    : [];

/** La nota más reciente: la del último paso del flujo. */
export function extractRegisterNotes(register: string | null): string | null {
  const notes = readNotes(register);
  return notes[notes.length - 1] || null;
}

/**
 * La nota del primer paso: lo que escribió quien reportó la novedad
 * (`ProcessNotes` al abrir el correctivo). En cuanto otro paso añade su nota,
 * la más reciente deja de serlo, así que esta se lee aparte.
 */
export function extractReportNotes(register: string | null): string | null {
  return readNotes(register)[0] || null;
}

export type RegisterLogEntry = {
  /** Fecha y hora local de OpenMAINT, sin zona; `null` si no se pudo leer. */
  at: string | null;
  /** Código del paso (`CM02`, `CM05`…). */
  stepCode: string | null;
  /** Nombre del paso tal como lo da OpenMAINT. */
  step: string | null;
  author: string | null;
  role: string | null;
  note: string;
  /** El supervisor devolvió el trabajo a asignación con esta nota. */
  isRejection: boolean;
};

/**
 * Notas posteriores a la apertura, en orden cronológico. La del primer paso es
 * el reporte y va aparte (`extractReportNotes`); los pasos sin nota se omiten.
 */
export function extractRegisterLog(
  register: string | null,
  /** Estado actual del proceso: distingue un rechazo aún sin reasignar. */
  currentStatusCode?: string | null,
): RegisterLogEntry[] {
  if (!register) {
    return [];
  }

  const entries = register
    .split(ENTRY_SPLIT_REGEX)
    .slice(1)
    .map((html) => {
      const step = readBlock(html, 'step');
      const [, stepCode, stepName] =
        /^(\w+)\s*-\s*(.+)$/.exec(step ?? '') ?? [];

      return {
        at: toLocalIso(readBlock(html, 'date'), readBlock(html, 'time')),
        stepCode: stepCode ?? null,
        step: stepName ?? step,
        author: readBlock(html, 'userdescr') ?? readBlock(html, 'username'),
        role: readBlock(html, 'userrole'),
        note: readBlock(html, 'notes') ?? '',
      };
    });

  return entries
    .map((entry, index) => ({
      ...entry,
      // Un rechazo de cierre es la nota de CM05 seguida de la vuelta a CM02; si
      // es la última entrada, lo dice el estado actual.
      isRejection:
        entry.stepCode === 'CM05' &&
        (index < entries.length - 1
          ? entries[index + 1].stepCode === 'CM02'
          : (currentStatusCode ?? '').endsWith('Assignment')),
    }))
    .slice(1)
    .filter((entry) => entry.note !== '');
}
