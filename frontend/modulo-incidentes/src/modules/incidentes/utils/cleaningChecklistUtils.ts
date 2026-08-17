export type ChecklistItem = {
  originalIndex: number;
  text: string;
  /**
   * Índice de check propio. Solo lo tienen los items de secciones **sin**
   * título: cuando hay título, el check vive en el título.
   */
  checkableIndex: number | null;
};

export type ChecklistSection = {
  title: string | null;
  /** Índice de check del título; `null` cuando la sección no tiene título. */
  checkableIndex: number | null;
  items: ChecklistItem[];
};

const capitalizeFirstLetter = (string: string) => {
  if (!string) return string;
  return string.charAt(0).toUpperCase() + string.slice(1);
};

/** Un título viene envuelto en asteriscos: `*Cama*`. */
const isTitleLine = (trimmed: string) =>
  trimmed.length >= 3 && trimmed.startsWith("*") && trimmed.endsWith("*");

/**
 * Parte el `Detalle` de la plantilla en secciones.
 *
 * El check lo da el título de la sección, no cada elemento. Las plantillas que
 * no traen ningún título son la excepción: ahí los elementos conservan su
 * propio check, porque si no la tarea no se podría completar nunca.
 */
export const parseCleaningChecklist = (
  activities: string[],
): ChecklistSection[] => {
  const result: ChecklistSection[] = [];
  let currentSection: ChecklistSection = {
    title: null,
    checkableIndex: null,
    items: [],
  };
  let checkableIndex = 0;

  const flushSection = () => {
    if (currentSection.items.length > 0 || currentSection.title !== null) {
      result.push(currentSection);
    }
  };

  activities.forEach((activity, originalIndex) => {
    const trimmed = activity.trim();

    if (isTitleLine(trimmed)) {
      flushSection();
      currentSection = {
        title: capitalizeFirstLetter(trimmed.slice(1, -1).trim()),
        checkableIndex: checkableIndex++,
        items: [],
      };
      return;
    }

    const parsedText = trimmed.startsWith("-")
      ? trimmed.replace(/^-/, "").trim()
      : trimmed;

    currentSection.items.push({
      originalIndex,
      text: capitalizeFirstLetter(parsedText),
      checkableIndex:
        currentSection.title === null ? checkableIndex++ : null,
    });
  });

  flushSection();

  return result;
};

/**
 * Cuántos checks tiene el checklist. Se deriva del mismo parseo para que no
 * pueda desalinearse con lo que se renderiza.
 */
export const getCheckableActivitiesCount = (activities: string[]): number =>
  parseCleaningChecklist(activities).reduce(
    (total, section) =>
      total +
      (section.checkableIndex !== null ? 1 : 0) +
      section.items.filter((item) => item.checkableIndex !== null).length,
    0,
  );
