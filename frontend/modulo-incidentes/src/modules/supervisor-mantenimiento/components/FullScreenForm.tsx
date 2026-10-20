import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { AppLayout } from "@/app/layout/AppLayout";

type Props = {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  submitLabel: string;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  /** Qué falta para poder guardar; se anuncia sobre la barra */
  missing?: string | null;
  error?: string | null;
  children: ReactNode;
};

/** Pantalla completa para tareas con varias decisiones: cabecera, tarjetas y barra fija. */
export const FullScreenForm = ({
  title,
  subtitle,
  onClose,
  submitLabel,
  submitting,
  canSubmit,
  onSubmit,
  missing,
  error,
  children,
}: Props) => (
  <AppLayout className="bg-[#f1f1f2]">
    <main className="flex min-h-screen flex-col bg-[#f1f1f2]">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={submitting}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
            {subtitle ? (
              <p className="truncate text-sm text-slate-600">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 px-4 py-4 pb-40">{children}</div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : missing ? (
          <p
            role="status"
            className="mb-3 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900"
          >
            {missing}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-12 rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            <Check className="h-4 w-4" aria-hidden />
            {submitting ? "Guardando..." : submitLabel}
          </button>
        </div>
      </div>
    </main>
  </AppLayout>
);

export const FormCard = ({ children }: { children: ReactNode }) => (
  <section className="space-y-5 rounded-3xl bg-white p-5 shadow-sm">
    {children}
  </section>
);

export const FormField = ({
  label,
  htmlFor,
  note = "obligatorio",
  help,
  children,
}: {
  label: string;
  htmlFor?: string;
  note?: "obligatorio" | "opcional" | "no editable";
  help?: string;
  children: ReactNode;
}) => (
  <div>
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-bold text-slate-900"
    >
      {label} <span className="font-normal text-slate-600">({note})</span>
    </label>
    {children}
    {help ? <p className="mt-1.5 text-xs text-slate-600">{help}</p> : null}
  </div>
);
