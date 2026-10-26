import type { ComponentType } from "react";
import { formatDayMonthYearTime } from "@/shared/utils/dateUtils";

export type WorkCardField = {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  dateTime?: string;
};

export const dateField = (
  icon: WorkCardField["icon"],
  label: string,
  value: string | null,
): WorkCardField => ({
  icon,
  label,
  value: formatDayMonthYearTime(value, "Sin fecha"),
  dateTime: value ?? undefined,
});
