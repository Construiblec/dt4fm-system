import { X } from "lucide-react";
import {
  REPORTER_TONES,
  type ReporterStep,
} from "@/modules/incidentes/constants/reporterStatus";

const R = 16;
const GAP_DEG = 8;

const arc = (index: number) => {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(20 + R * Math.cos(rad)).toFixed(2)} ${(20 + R * Math.sin(rad)).toFixed(2)}`;
  };
  const start = -90 + index * 90 + GAP_DEG;
  const end = -90 + (index + 1) * 90 - GAP_DEG;
  return `M${point(start)} A${R} ${R} 0 0 1 ${point(end)}`;
};

/** Anillo de cuatro tramos (Recibido → Resuelto) con «n/4» en el centro. */
export const ProgressRing = ({ status }: { status: ReporterStep }) => {
  const tone = REPORTER_TONES[status.tone];
  const discarded = status.step < 0;

  return (
    <div
      className="relative flex h-11 w-11 shrink-0 items-center justify-center"
      aria-label={discarded ? status.label : `Paso ${status.step + 1} de 4`}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0.5" aria-hidden>
        {[0, 1, 2, 3].map((index) => {
          const filled = discarded ? index === 0 : index <= status.step;
          return (
            <path
              key={index}
              d={arc(index)}
              fill="none"
              strokeWidth={4}
              strokeLinecap="round"
              stroke={filled ? tone.stroke : "#e2e8f0"}
            />
          );
        })}
      </svg>
      {discarded ? (
        <X className={`h-3.5 w-3.5 ${tone.text}`} strokeWidth={3} />
      ) : (
        <span className={`text-[11px] font-bold ${tone.text}`}>
          {status.step + 1}/4
        </span>
      )}
    </div>
  );
};

export const ReporterChip = ({ status }: { status: ReporterStep }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${REPORTER_TONES[status.tone].chip}`}
  >
    {status.label}
  </span>
);
