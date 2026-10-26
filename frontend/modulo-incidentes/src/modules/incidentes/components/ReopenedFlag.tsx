import { RotateCcw } from "lucide-react";
import { STATUS_LEVELS } from "@/shared/constants/statusPalette";

export const ReopenedFlag = () => (
  <span
    className={`inline-flex items-center gap-[5px] rounded-full py-[3px] pl-2 pr-[9px] text-xs font-semibold leading-[1.4] ${STATUS_LEVELS.new.badge}`}
  >
    <RotateCcw aria-hidden="true" className="h-3 w-3 shrink-0" />
    Reabierta
  </span>
);
