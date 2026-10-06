import type { ReactNode } from "react";

type GuestPageShellProps = {
  children: ReactNode;
  /** Ancho en escritorio: el panel usa dos columnas, las pantallas de un paso no. */
  width?: "wide" | "narrow";
};

/**
 * Sin `AppLayout` a propósito: sus banners de instalación y notificaciones son
 * del personal, y su tope de 448 px desperdiciaría la pantalla del escritorio.
 */
export const GuestPageShell = ({
  children,
  width = "wide",
}: GuestPageShellProps) => (
  <div className="min-h-screen bg-slate-50 text-slate-900">
    <main
      className={`mx-auto w-full max-w-md px-4 pb-10 pt-6 lg:px-8 lg:pt-10 ${
        width === "wide" ? "lg:max-w-5xl" : "lg:max-w-2xl"
      }`}
    >
      {children}
    </main>
  </div>
);
