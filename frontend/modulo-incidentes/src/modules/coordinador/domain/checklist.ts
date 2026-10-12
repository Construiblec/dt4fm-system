/**
 * Checklists vistos por el coordinador: resumen para listas y selectores, y la
 * revisión que le dice a quien edita una plantilla qué va a pasar con cada fila.
 *
 * El parser es el de la app del empleado (`cleaningChecklistUtils.ts`), el
 * mismo que lee el equipo: lo que aquí se previsualiza es lo que se va a ver.
 */
import {
  countChecklistActivities,
  detectDelimiter,
  formatMinutes,
  getChecklistTotalMinutes,
  isHeaderRow,
  normalize,
  parseCleaningChecklist,
  parseMinutes,
  splitCsvLine,
  type ChecklistSection,
} from "@/modules/incidentes/utils/cleaningChecklistUtils";

export type ChecklistSummary = {
  sections: ChecklistSection[];
  sectionCount: number;
  activityCount: number;
  minutes: number | null;
  isPartial: boolean;
};

export const summarizeChecklist = (
  rows: string[] | null | undefined,
): ChecklistSummary => {
  const sections = parseCleaningChecklist(rows ?? []);
  const total = getChecklistTotalMinutes(sections);

  return {
    sections,
    sectionCount: sections.length,
    activityCount: countChecklistActivities(sections),
    minutes: total.minutes,
    isPartial: total.isPartial,
  };
};

/** "~75 min", "Sin minutos" o "Sin actividades". */
export const describeChecklistMinutes = (summary: ChecklistSummary): string => {
  if (summary.activityCount === 0) return "Sin actividades";
  if (summary.minutes === null) return "Sin minutos";
  return `${summary.isPartial ? "~" : ""}${formatMinutes(summary.minutes)}`;
};

/** Lo que hace el backend con `Detalle` cuando no hay archivo. */
export const detalleToRows = (detalle: string | null | undefined): string[] =>
  String(detalle ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export type LintWarning = {
  level: "info" | "warn" | "error";
  row?: number;
  text: string;
};

/**
 * Repite los pasos del parser para avisar de lo que va a pasar con cada fila
 * (encabezado, celda de minutos vacía, sección repetida…). No cambia lo que
 * muestra el parser: solo lo explica.
 */
export const lintChecklist = (
  rows: string[],
): { delimiter: "," | ";"; warnings: LintWarning[] } => {
  const warnings: LintWarning[] = [];
  if (rows.length === 0) return { delimiter: ",", warnings };

  const delimiter = detectDelimiter(rows);
  let inherited = "";
  let currentKey: string | null = null;
  const seenTitles = new Map<string, number>();
  const untitled: number[] = [];
  let withoutMinutes = 0;
  let activities = 0;
  let tabsWarned = false;

  rows.forEach((line, index) => {
    const rowNumber = index + 1;
    const fields = splitCsvLine(line, delimiter);

    if (index === 0 && isHeaderRow(fields)) {
      warnings.push({
        level: "info",
        row: rowNumber,
        text: `Se detectó un encabezado («${line}»): no se muestra como actividad.`,
      });
      return;
    }

    if (fields.every((field) => field === "")) return;

    if (!tabsWarned && fields.length === 1 && line.includes("\t")) {
      tabsWarned = true;
      warnings.push({
        level: "error",
        row: rowNumber,
        text: "El archivo parece separado por tabulaciones (lo que deja «Texto Unicode» de Excel): cada fila se ve como una sola actividad. Guárdalo como «CSV UTF-8 (delimitado por comas)».",
      });
    }

    if (fields.length === 1) {
      activities += 1;
      withoutMinutes += 1;
      if (!inherited) untitled.push(rowNumber);
      return;
    }

    const last = fields[fields.length - 1];
    const minutes = fields.length >= 3 ? parseMinutes(last) : null;

    if (fields.length >= 3) {
      if (last === "") {
        warnings.push({
          level: "info",
          row: rowNumber,
          text: `Fila ${rowNumber}: la celda de minutos está vacía; la actividad queda sin minutos.`,
        });
      } else if (minutes === null) {
        warnings.push({
          level: "warn",
          row: rowNumber,
          text: `Fila ${rowNumber}: «${last}» no es un número de minutos; se toma como parte de la actividad.`,
        });
      } else if (last.includes(",")) {
        warnings.push({
          level: "info",
          row: rowNumber,
          text: `Fila ${rowNumber}: minutos con coma decimal (${last}) se leen como ${minutes}.`,
        });
      }

      if (minutes !== null && fields.length > 3) {
        warnings.push({
          level: "warn",
          row: rowNumber,
          text: `Fila ${rowNumber}: tiene más de 3 columnas y se unió el texto de la actividad (¿un separador sin comillas dentro del texto?).`,
        });
      }
    }

    const text = (
      minutes !== null || (fields.length >= 3 && last === "")
        ? fields.slice(1, -1)
        : fields.slice(1)
    )
      .join(`${delimiter} `)
      .trim();

    if (!text) {
      warnings.push({
        level: "info",
        row: rowNumber,
        text: `Fila ${rowNumber}: tiene título («${fields[0]}») pero no actividad; se ignora.`,
      });
      return;
    }

    activities += 1;
    if (minutes === null) withoutMinutes += 1;

    const rawTitle = fields[0] || inherited;
    inherited = rawTitle;
    if (!rawTitle) untitled.push(rowNumber);

    const key = rawTitle ? normalize(rawTitle) : null;
    if (key !== currentKey) {
      if (key && seenTitles.has(key)) {
        warnings.push({
          level: "info",
          row: rowNumber,
          text: `Fila ${rowNumber}: la sección «${rawTitle}» vuelve a aparecer (ya estaba en la fila ${seenTitles.get(key)}). Se muestra como una sección nueva, en ese orden.`,
        });
      } else if (key) {
        seenTitles.set(key, rowNumber);
      }
      currentKey = key;
    }
  });

  if (untitled.length > 0) {
    warnings.push({
      level: "info",
      row: untitled[0],
      text: `${
        untitled.length === 1
          ? `La fila ${untitled[0]} no tiene`
          : `Las filas ${untitled.join(", ")} no tienen`
      } título de sección: se muestran sin sección.`,
    });
  }

  if (activities > 0 && withoutMinutes === activities) {
    warnings.push({
      level: "warn",
      text: "Ninguna actividad tiene minutos: el asistente de voz no hará recordatorios con este checklist.",
    });
  } else if (withoutMinutes > 0) {
    warnings.push({
      level: "warn",
      text: `${
        withoutMinutes === 1
          ? "1 actividad no tiene"
          : `${withoutMinutes} actividades no tienen`
      } minutos: no habrá recordatorio para ${withoutMinutes === 1 ? "ella." : "ellas."}`,
    });
  }

  return { delimiter, warnings };
};

export const ENCODING_LABELS: Record<string, string> = {
  "utf-8": "UTF-8",
  "utf-16": "UTF-16 (Texto Unicode)",
  "windows-1252": "Windows-1252 (Excel)",
};

export const formatBytes = (size: number): string =>
  size < 1024
    ? `${size} B`
    : `${(size / 1024).toFixed(1).replace(".", ",")} KB`;

/** Ejemplo descargable, con el formato que lee el equipo. */
export const EXAMPLE_CSV = [
  "Titulo;Actividad;Minutos",
  "Ingreso;Abrir ventanas y ventilar la unidad;2",
  "Dormitorio;Tender la cama con juego limpio;8",
  "Baño;Lavar y desinfectar el inodoro;5",
  "Baño;Reponer papel higiénico, jabón y toallas;3",
  "Cocina;Limpiar mesón, cocina y campana;7",
  "Cierre;Cerrar ventanas y apagar luces;2",
].join("\r\n");
