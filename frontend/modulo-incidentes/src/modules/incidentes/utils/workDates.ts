import {
  formatDayMonthYearTime,
  formatElapsed,
} from "@/shared/utils/dateUtils";

export type WorkDates = {
  plannedStart?: string | null;
  execStartDate?: string | null;
  execEndDate?: string | null;
};

export type WorkDateRow = { label: string; value: string };

/** Filas de «Fechas del trabajo»; las que no tienen valor no se muestran. */
export const buildWorkDateRows = ({
  plannedStart,
  execStartDate,
  execEndDate,
}: WorkDates): WorkDateRow[] => {
  const duration = formatElapsed(execStartDate, execEndDate);

  return [
    plannedStart && {
      label: "Inicio previsto",
      value: formatDayMonthYearTime(plannedStart),
    },
    execStartDate && {
      label: "Inicio real",
      value: formatDayMonthYearTime(execStartDate),
    },
    execEndDate && { label: "Fin", value: formatDayMonthYearTime(execEndDate) },
    duration && { label: "Duración", value: duration },
  ].filter((row): row is WorkDateRow => Boolean(row));
};
