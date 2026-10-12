import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { FOCUS } from "./ui";
import { cx } from "./uiUtils";

/** Cierra con Esc. */
const useEscape = (
  onEscape: (event: KeyboardEvent) => void,
  enabled = true,
) => {
  const ref = useRef(onEscape);

  useEffect(() => {
    ref.current = onEscape;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") ref.current(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
};

/** Mientras hay un panel abierto, la página de atrás no se desplaza. */
const useBodyLock = () => {
  useEffect(() => {
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, []);
};

type ModalProps = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: string;
};

export const Modal = ({
  title,
  children,
  footer,
  onClose,
  width = "max-w-md",
}: ModalProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>("textarea, input, select, button")
      ?.focus();
  }, []);

  useEscape((event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  });

  return (
    <div
      data-modal-open="true"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"
    >
      <div
        ref={ref}
        className={cx("w-full rounded-2xl bg-white p-6 shadow-xl", width)}
      >
        <h2 className="text-lg font-bold text-slate-900 [text-wrap:balance]">
          {title}
        </h2>
        <div className="mt-3 space-y-3 text-sm text-slate-700">{children}</div>
        {footer ? (
          <div className="mt-6 grid grid-cols-2 gap-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
};

type DrawerProps = {
  title: string;
  eyebrow?: ReactNode;
  badges?: ReactNode;
  onClose: () => void;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Panel lateral: la ficha de una limpieza se abre encima de la pantalla sin sacarte de ella. */
export const Drawer = ({
  title,
  eyebrow,
  badges,
  onClose,
  width = "max-w-[600px]",
  children,
  footer,
}: DrawerProps) => {
  const panelRef = useRef<HTMLElement>(null);
  useBodyLock();

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEscape((event) => {
    // Un modal abierto encima atiende su propio Esc.
    if (document.querySelector("[data-modal-open]")) return;
    event.preventDefault();
    onClose();
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-40 flex justify-end"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/40"
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          "relative flex h-full w-full flex-col bg-gray-50 shadow-2xl outline-none",
          width,
        )}
      >
        <header className="flex items-start gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1">
            {eyebrow ? (
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                {eyebrow}
              </div>
            ) : null}
            <h2 className="text-lg font-bold leading-snug text-slate-900 [text-wrap:balance]">
              {title}
            </h2>
            {badges ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {badges}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className={cx(
              "shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100",
              FOCUS,
            )}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
        {footer ? (
          <footer className="border-t border-slate-200 bg-white px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
};
