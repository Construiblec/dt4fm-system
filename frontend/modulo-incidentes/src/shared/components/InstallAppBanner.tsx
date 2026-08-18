import { useState } from "react";
import { Download, X } from "lucide-react";
import type { InstallPromptMode } from "@/shared/hooks/useInstallPrompt";
import { IosInstallSheet } from "@/shared/components/IosInstallSheet";

type InstallAppBannerProps = {
  mode: InstallPromptMode;
  /** Se baja cuando la barra de tarea activa ya ocupa el tope. */
  offsetTop: boolean;
  onInstall: () => void;
  onDismiss: () => void;
};

export const InstallAppBanner = ({
  mode,
  offsetTop,
  onInstall,
  onDismiss,
}: InstallAppBannerProps) => {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (mode === "hidden") {
    return null;
  }

  return (
    <>
      <div
        className={`fixed left-0 right-0 z-40 border-b border-blue-800 bg-brand text-white shadow-lg ${
          offsetTop ? "top-14" : "top-0"
        }`}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Download className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Instala Construiblec</p>
              <p className="text-xs text-white/90">
                Acceso directo y mas rapido desde tu inicio
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() =>
                mode === "ios-instructions" ? setSheetOpen(true) : onInstall()
              }
              className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand"
            >
              Instalar
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Descartar"
              className="rounded-full p-1.5 text-white/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <IosInstallSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
};
