import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { initialsOf } from "@/modules/supervisor/utils/supervisionView";

type Props = {
  kicker: string;
  title: string;
  onBack: () => void;
  /** Lo que va a la derecha (por ejemplo, la fecha en una píldora). */
  aside?: ReactNode;
  /** Bajo el título: progreso, contadores. */
  children?: ReactNode;
};

/** Cabecera de las pantallas de supervisión: volver, rótulo y título. */
export const SupervisionHeader = ({
  kicker,
  title,
  onBack,
  aside,
  children,
}: Props) => (
  <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Volver"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          {kicker}
        </p>
        <h1 className="truncate text-base font-bold text-slate-900">{title}</h1>
      </div>
      {aside}
    </div>
    {children ? <div className="mt-3">{children}</div> : null}
  </header>
);

/** Rótulo de sección dentro de una tarjeta: «UNIDAD A SUPERVISAR». */
export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
    {children}
  </p>
);

export const Avatar = ({
  name,
  active = false,
}: {
  name: string;
  active?: boolean;
}) => (
  <span
    aria-hidden
    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
      active ? "bg-brand text-white" : "bg-slate-200 text-slate-700"
    }`}
  >
    {initialsOf(name)}
  </span>
);
