import { BottomSheet } from "@/shared/components/BottomSheet";
import {
  PRIORITY_ADJECTIVES,
  PRIORITY_GUIDE,
  PRIORITY_GUIDE_CLASSES,
  PRIORITY_ORDER,
} from "@/shared/constants/priority";

type SheetProps = {
  open: boolean;
  onClose: () => void;
};

export const PriorityGuideSheet = ({ open, onClose }: SheetProps) => (
  <BottomSheet open={open} title="¿Cómo elegir la prioridad?" onClose={onClose}>
    <div className="space-y-2 px-5">
      <p className="pb-1 text-[13px] text-slate-600">
        Según el riesgo y el tiempo máximo para atender.
      </p>

      {PRIORITY_ORDER.map((code) => {
        const guide = PRIORITY_GUIDE[code];
        const styles = PRIORITY_GUIDE_CLASSES[code];

        return (
          <section
            key={code}
            className={`space-y-1 rounded-xl border p-3 ${styles.box}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className={`text-[15px] font-bold ${styles.title}`}>
                {guide.level} · {PRIORITY_ADJECTIVES[code]}
              </h3>
              <span
                className={`rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${styles.border} ${styles.title}`}
              >
                {guide.sla}
              </span>
            </div>
            <p className="text-[13px] leading-snug text-slate-700">
              {guide.action}
            </p>
            <p className="text-[13px] leading-snug text-slate-600">
              Ej.: {guide.examples}
            </p>
          </section>
        );
      })}

      <button
        type="button"
        onClick={onClose}
        className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-brand text-[15px] font-bold text-white transition hover:bg-brand-hover"
      >
        Entendido
      </button>
    </div>
  </BottomSheet>
);
