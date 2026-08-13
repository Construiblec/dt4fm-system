export type ChecklistItem = {
  originalIndex: number;
  checkableIndex: number;
  text: string;
};

export type ChecklistSection = {
  title: string | null;
  items: ChecklistItem[];
};

const capitalizeFirstLetter = (string: string) => {
  if (!string) return string;
  return string.charAt(0).toUpperCase() + string.slice(1);
};

export const parseCleaningChecklist = (activities: string[]): ChecklistSection[] => {
  const result: ChecklistSection[] = [];
  let currentSection: ChecklistSection = { title: null, items: [] };
  let checkableIndex = 0;

  activities.forEach((activity, originalIndex) => {
    const trimmed = activity.trim();
    const isTitle = trimmed.startsWith("*") && trimmed.endsWith("*");

    if (isTitle) {
      if (currentSection.items.length > 0 || currentSection.title !== null) {
        result.push(currentSection);
      }
      const parsedTitle = trimmed.slice(1, -1).trim();
      currentSection = { title: capitalizeFirstLetter(parsedTitle), items: [] };
    } else {
      const parsedText = trimmed.startsWith("-") ? trimmed.replace(/^-/, "").trim() : trimmed;
      currentSection.items.push({
        originalIndex,
        checkableIndex: checkableIndex++,
        text: capitalizeFirstLetter(parsedText),
      });
    }
  });

  if (currentSection.items.length > 0 || currentSection.title !== null) {
    result.push(currentSection);
  }

  return result;
};

export const getCheckableActivitiesCount = (activities: string[]): number => {
  return activities.filter((a) => {
    const trimmed = a.trim();
    return !(trimmed.startsWith("*") && trimmed.endsWith("*"));
  }).length;
};
