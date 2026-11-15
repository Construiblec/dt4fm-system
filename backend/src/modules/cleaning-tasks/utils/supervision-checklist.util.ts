import { SUPERVISION_POINT_COUNT } from '../constants/supervision.constants';

/**
 * Lector del checklist de supervisión: un CSV de cuatro columnas
 * (`area;guia_area;nombre_item;descripcion_criterio`) que vive en la tarjeta
 * `SUPERVISION` de `CleaningActivity`.
 *
 * Recibe las filas lógicas que ya entrega `readCsvTemplate` (BOM, codificación
 * y saltos dentro de comillas resueltos). Aquí solo se cortan las celdas.
 *
 * El número de punto (`index`) es la posición de la fila, empezando en 1. Las
 * novedades guardan ese número en `CleaningFinding.Index`, así que el orden de
 * las filas no debe cambiar ni deben borrarse filas.
 */

export type SupervisionPoint = {
  /** 1 = primera fila de datos (hoy «Tendido de camas»). */
  index: number;
  area: string;
  areaGuide: string;
  name: string;
  criterion: string;
};

export type SupervisionArea = {
  name: string;
  guide: string;
  points: SupervisionPoint[];
};

export type SupervisionChecklistResult =
  | { ok: true; points: SupervisionPoint[] }
  | { ok: false; reason: string };

const EXPECTED_HEADER = [
  'area',
  'guia_area',
  'nombre_item',
  'descripcion_criterio',
];

/** Sin tildes, minúsculas y sin espacios: «Guía área» y «guia_area» cuentan igual. */
const normalizeHeader = (cell: string): string =>
  cell
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');

/**
 * Corta una fila en celdas respetando comillas: un `;` dentro de comillas es
 * texto, y `""` es una comilla literal.
 */
export const splitCsvRow = (row: string, delimiter: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      if (insideQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

/** El encabezado decide el separador: Excel en español usa `;`, el resto `,`. */
const detectDelimiter = (header: string): string => {
  const semicolons = splitCsvRow(header, ';').length;
  const commas = splitCsvRow(header, ',').length;
  return commas > semicolons ? ',' : ';';
};

/**
 * Convierte las filas en puntos. Nunca lanza: devuelve el motivo del rechazo
 * para que quien llama decida (400 al guardar, log al leer).
 *
 * `expectedCount` exige un número exacto de puntos; solo se usa al guardar la
 * plantilla, para que un CSV distinto no cambie el significado de los índices.
 */
export const parseSupervisionChecklist = (
  rows: string[],
  expectedCount?: number,
): SupervisionChecklistResult => {
  const nonEmpty = rows.map((row) => row.trim()).filter(Boolean);
  if (nonEmpty.length === 0) {
    return { ok: false, reason: 'el checklist de supervisión está vacío' };
  }

  const delimiter = detectDelimiter(nonEmpty[0]);
  const header = splitCsvRow(nonEmpty[0], delimiter).map(normalizeHeader);
  const headerOk = EXPECTED_HEADER.every((name, i) => header[i] === name);
  if (!headerOk) {
    return {
      ok: false,
      reason: `el encabezado debe ser ${EXPECTED_HEADER.join(';')}`,
    };
  }

  const points: SupervisionPoint[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = splitCsvRow(nonEmpty[i], delimiter);
    // Una fila de puros separadores (Excel las deja al final) no es un punto.
    if (cells.every((cell) => !cell)) continue;

    const [area = '', areaGuide = '', name = '', criterion = ''] = cells;
    if (!area || !name) {
      return {
        ok: false,
        reason: `la fila ${i + 1} no tiene área o nombre del punto`,
      };
    }
    points.push({
      index: points.length + 1,
      area,
      areaGuide,
      name,
      criterion,
    });
  }

  if (points.length === 0) {
    return { ok: false, reason: 'el checklist de supervisión no tiene puntos' };
  }

  if (expectedCount !== undefined && points.length !== expectedCount) {
    return {
      ok: false,
      reason:
        `el checklist de supervisión debe tener ${expectedCount} puntos y tiene ${points.length}. ` +
        'No elimines ni agregues filas: las novedades guardan el número de punto.',
    };
  }

  return { ok: true, points };
};

/** Igual que `parseSupervisionChecklist`, con el número de puntos vigente. */
export const validateSupervisionTemplate = (rows: string[]) =>
  parseSupervisionChecklist(rows, SUPERVISION_POINT_COUNT);

/** Agrupa los puntos por área, en el orden en que aparecen. */
export const groupPointsByArea = (
  points: SupervisionPoint[],
): SupervisionArea[] => {
  const areas: SupervisionArea[] = [];
  for (const point of points) {
    let area = areas.find((a) => a.name === point.area);
    if (!area) {
      area = { name: point.area, guide: point.areaGuide, points: [] };
      areas.push(area);
    }
    area.points.push(point);
  }
  return areas;
};
