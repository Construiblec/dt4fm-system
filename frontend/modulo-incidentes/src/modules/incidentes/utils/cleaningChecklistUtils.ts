/**
 * El `Detalle` de la plantilla de limpieza viaja como CSV de 3 columnas:
 *
 *   Titulo,Actividad,Minutos
 *   Dormitorio,Separar la cama del espaldar,2
 *   Baño,"Frotar las paredes para sacar sarro de mamparas, azulejos y grifería",8
 *
 * El separador puede ser coma o punto y coma: Excel en español exporta con `;`
 * porque reserva la coma para los decimales, y quién exporta la plantilla no es
 * quién escribe este código. Se detecta por plantilla (ver `detectDelimiter`).
 *
 * El backend ya partió el texto por `\n` y descartó las líneas vacías
 * (`cleaning-tasks.service.ts`, `fetchChecklistDetail`), así que acá cada entrada
 * de `activities` es UNA fila.
 *
 * Limitación conocida y no arreglable desde acá: un campo entrecomillado que
 * contenga un salto de línea REAL llega partido en dos entradas del array y ya no
 * hay forma de volver a unirlo. Por eso tampoco se trae una librería de CSV: su
 * capacidad principal es justo esa, y el pipeline ya la destruyó. Si algún día
 * hace falta, el arreglo va en `fetchChecklistDetail` (dejar de partir por `\n`)
 * y recién ahí tiene sentido traer una dependencia.
 */

export type ChecklistActivity = {
  /** Posición de la fila dentro de `activities`. Key estable para React. */
  originalIndex: number;
  /** Columna `Actividad`. */
  text: string;
  /**
   * Columna `Minutos`. `null` cuando la plantilla no la trae o no es un número
   * usable. Se guarda crudo (puede ser decimal): redondear es cosa de la UI.
   */
  minutes: number | null;
  /** Índice del check. Lo tiene TODA actividad, denso desde 0. */
  checkableIndex: number;
};

export type ChecklistSection = {
  /** Columna `Titulo`. `null` solo en las filas previas al primer título. */
  title: string | null;
  /** Suma de los `minutes` presentes. `null` si ninguna actividad los trae. */
  totalMinutes: number | null;
  /** `true` si conviven actividades con y sin minutos: el total es parcial. */
  hasPartialMinutes: boolean;
  items: ChecklistActivity[];
};

const capitalizeFirstLetter = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** Minúsculas y sin tildes. Solo para comparar, nunca para mostrar. */
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const HEADER_TITLE_CELLS = new Set(["titulo", "seccion", "title", "section"]);
const HEADER_ACTIVITY_CELLS = new Set(["actividad", "activity", "tarea"]);

/**
 * La cabecera es opcional. Se prueba SOLO en la primera fila y exigiendo que
 * coincidan las dos primeras celdas: así una actividad que por casualidad se
 * llame "Actividad" no puede desaparecer del checklist sin que nadie lo note.
 */
const isHeaderRow = (fields: string[]) =>
  HEADER_TITLE_CELLS.has(normalize(fields[0] ?? "")) &&
  HEADER_ACTIVITY_CELLS.has(normalize(fields[1] ?? ""));

/** Separadores que puede traer la plantilla (ver `detectDelimiter`). */
type Delimiter = "," | ";";

/** Parte UNA línea CSV respetando comillas. */
const splitCsvLine = (line: string, delimiter: Delimiter): string[] => {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inQuotes) {
      if (char !== '"') {
        field += char;
        continue;
      }
      // `""` dentro de comillas es una comilla literal.
      if (line[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }
      inQuotes = false;
      continue;
    }

    // Las comillas solo ABREN al principio del campo: en `5" de alto` la comilla
    // es texto, no sintaxis.
    if (char === '"' && field.trim() === "") {
      inQuotes = true;
      field = "";
      continue;
    }

    if (char === delimiter) {
      fields.push(field);
      field = "";
      continue;
    }

    field += char;
  }

  fields.push(field);
  return fields.map((value) => value.trim());
};

/**
 * Excel en español exporta con punto y coma, porque reserva la coma para los
 * decimales. Como la plantilla la edita una persona en su propia máquina, el
 * separador depende de la configuración regional de quien la exportó y no hay
 * forma de imponerlo: se detecta.
 *
 * No se cuenta cuál carácter aparece más: un texto lleno de comas dentro de una
 * plantilla separada por `;` ganaría por goleada y elegiría mal. Se mira con cuál
 * separador la plantilla entera tiene sentido, en tres niveles de desempate:
 *
 * 1. Filas que terminan en un número. Es la señal más fuerte, porque `Minutos`
 *    es la última columna: partir `Baño;Frotar paredes, azulejos;8` por coma
 *    también da 3 campos, pero el último queda `azulejos;8`, que no es un número.
 * 2. Filas con exactamente 3 campos.
 * 3. Filas que al menos se partieron en dos (cubre plantillas sin minutos).
 *
 * Ante un empate total gana la coma, que es el formato documentado.
 */
const detectDelimiter = (activities: string[]): Delimiter => {
  const score = (delimiter: Delimiter) =>
    activities.reduce(
      (totals, line) => {
        const fields = splitCsvLine(line, delimiter);
        const endsInNumber =
          fields.length >= 2 && parseMinutes(fields[fields.length - 1]) !== null;

        return {
          numeric: totals.numeric + (endsInNumber ? 1 : 0),
          exact: totals.exact + (fields.length === 3 ? 1 : 0),
          split: totals.split + (fields.length >= 2 ? 1 : 0),
        };
      },
      { numeric: 0, exact: 0, split: 0 },
    );

  const comma = score(",");
  const semicolon = score(";");

  for (const key of ["numeric", "exact", "split"] as const) {
    if (semicolon[key] !== comma[key]) {
      return semicolon[key] > comma[key] ? ";" : ",";
    }
  }

  return ",";
};

/** `"3"` → 3, `"2,5"` → 2.5, `"5 min"` / `""` / `"dos"` / `"-1"` → null. */
const parseMinutes = (raw: string): number | null => {
  // La coma decimal aparece cuando la plantilla se edita en una hoja de cálculo
  // en español; solo llega entera hasta acá si venía entrecomillada.
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;

  return value;
};

type ParsedRow = { title: string; text: string; minutes: number | null };

/**
 * Convierte una fila ya partida en título / actividad / minutos.
 *
 * Tolerancia deliberada: si la fila trae MÁS de 3 campos es casi siempre una coma
 * sin entrecomillar dentro de la actividad, así que se vuelven a unir en vez de
 * perder texto. Los minutos se leen del ÚLTIMO campo y solo si son un número; si
 * no lo son, ese campo también es parte de la actividad.
 *
 * El principio es: nunca borrar en silencio algo que el empleado tenía que hacer.
 * Una fila mal escrita se muestra rara, no desaparece.
 */
const toRow = (fields: string[], delimiter: Delimiter): ParsedRow | null => {
  if (fields.every((field) => field === "")) return null;

  // Una línea sin ningún separador: se toma como actividad y hereda el título.
  if (fields.length === 1) {
    return { title: "", text: fields[0], minutes: null };
  }

  const minutes =
    fields.length >= 3 ? parseMinutes(fields[fields.length - 1]) : null;
  // Se reúne con el mismo separador que las partió, para devolver el texto tal
  // como estaba escrito.
  const text = (minutes !== null ? fields.slice(1, -1) : fields.slice(1))
    .join(`${delimiter} `)
    .trim();

  // Título sin actividad (`Baño,`): no hay nada que marcar.
  if (!text) return null;

  return { title: fields[0], text, minutes };
};

export const parseCleaningChecklist = (
  activities: string[],
): ChecklistSection[] => {
  const sections: ChecklistSection[] = [];
  const delimiter = detectDelimiter(activities);
  let currentKey: string | null = null;
  let inheritedTitle = "";
  let checkableIndex = 0;

  activities.forEach((line, originalIndex) => {
    const fields = splitCsvLine(line, delimiter);

    if (originalIndex === 0 && isHeaderRow(fields)) return;

    const row = toRow(fields, delimiter);
    if (!row) return;

    // Celda de título vacía = "ídem". La plantilla repite el título en cada fila,
    // así que una en blanco es la fila a la que no se lo copiaron.
    const rawTitle = row.title || inheritedTitle;
    inheritedTitle = rawTitle;

    const key = rawTitle ? normalize(rawTitle) : null;

    // Un título que REAPARECE más abajo abre una sección nueva en vez de
    // fusionarse con la de arriba: el orden del CSV es el orden en que se recorre
    // la unidad, y agrupar lo reordenaría.
    if (sections.length === 0 || key !== currentKey) {
      currentKey = key;
      sections.push({
        title: rawTitle ? capitalizeFirstLetter(rawTitle) : null,
        totalMinutes: null,
        hasPartialMinutes: false,
        items: [],
      });
    }

    sections[sections.length - 1].items.push({
      originalIndex,
      text: capitalizeFirstLetter(row.text),
      minutes: row.minutes,
      checkableIndex,
    });
    checkableIndex += 1;
  });

  return sections.map((section) => {
    const withMinutes = section.items.filter((item) => item.minutes !== null);

    return {
      ...section,
      totalMinutes:
        withMinutes.length > 0
          ? withMinutes.reduce((total, item) => total + (item.minutes ?? 0), 0)
          : null,
      hasPartialMinutes:
        withMinutes.length > 0 && withMinutes.length < section.items.length,
    };
  });
};

/** Cuántos checks tiene el checklist: uno por actividad, sin huecos. */
export const countChecklistActivities = (
  sections: ChecklistSection[],
): number =>
  sections.reduce((total, section) => total + section.items.length, 0);

/**
 * Una sección está completa cuando TODAS sus actividades lo están.
 *
 * El estado fino por actividad es lo que confirma el comando de voz, elemento por
 * elemento; la interfaz solo muestra este booleano agregado. Por eso la sección no
 * tiene estado propio guardado: se deriva siempre, y así da igual si las marcas
 * llegaron por voz o por el tap del bloque.
 */
export const isSectionComplete = (
  section: ChecklistSection,
  progress: Record<number, boolean>,
): boolean =>
  section.items.length > 0 &&
  section.items.every((item) => Boolean(progress[item.checkableIndex]));

/** Cuántas secciones están completas. Es el contador que ve el operario. */
export const countCompletedSections = (
  sections: ChecklistSection[],
  progress: Record<number, boolean>,
): number =>
  sections.filter((section) => isSectionComplete(section, progress)).length;

/** Los índices de check de una sección, para marcarla o desmarcarla entera. */
export const getSectionIndices = (section: ChecklistSection): number[] =>
  section.items.map((item) => item.checkableIndex);

/**
 * Huella de la plantilla. No es criptográfica: solo sirve para que el store note
 * que el checklist en pantalla no es el mismo cuyos checks tiene guardados.
 */
export const getChecklistSignature = (sections: ChecklistSection[]): string => {
  const source = sections
    .flatMap((section) => section.items.map((item) => item.text))
    .join("\u0001");

  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash + source.charCodeAt(index)) | 0;
  }

  return `${source.length}:${(hash >>> 0).toString(36)}`;
};

/** Minutos para pintar. El valor crudo vive en `ChecklistActivity.minutes`. */
export const formatMinutes = (minutes: number): string =>
  `${Math.max(1, Math.round(minutes))} min`;
