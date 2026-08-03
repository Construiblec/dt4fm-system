import { useEffect, useMemo, useState } from "react";
import type {
  ChecklistAnswer,
  PreventiveChecklistItem,
} from "@/modules/incidentes/types/PreventiveChecklist";

type Result = {
  answers: Record<number, string>;
  setAnswer: (taskDefId: number, value: string) => void;
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  /** Respuestas listas para enviar al backend */
  payload: ChecklistAnswer[];
};

/**
 * Estado de las respuestas del checklist.
 *
 * Se inicializa con lo que ya haya guardado en OpenMAINT, de modo que reabrir
 * un mantenimiento a medias muestra el avance real. No se persiste en
 * `localStorage` a propósito: la fuente de verdad es OpenMAINT y una copia
 * local competiría con ella en cuanto se guardase.
 */
export const usePreventiveChecklist = (
  items: PreventiveChecklistItem[],
): Result => {
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const initialAnswers = useMemo(() => {
    const entries = items
      .filter((item) => item.value !== null && item.value !== "")
      .map((item) => [item.taskDefId, String(item.value)] as const);

    return Object.fromEntries(entries) as Record<number, string>;
  }, [items]);

  useEffect(() => {
    setAnswers(initialAnswers);
  }, [initialAnswers]);

  const setAnswer = (taskDefId: number, value: string) =>
    setAnswers((current) => ({ ...current, [taskDefId]: value }));

  const completedCount = items.filter((item) =>
    Boolean(answers[item.taskDefId]),
  ).length;

  const payload = items
    .filter((item) => Boolean(answers[item.taskDefId]))
    .map((item) => ({
      taskDefId: item.taskDefId,
      value: answers[item.taskDefId],
    }));

  return {
    answers,
    setAnswer,
    completedCount,
    totalCount: items.length,
    isComplete: items.length > 0 && completedCount === items.length,
    payload,
  };
};
