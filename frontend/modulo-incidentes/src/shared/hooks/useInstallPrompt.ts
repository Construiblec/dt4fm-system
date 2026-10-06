import { useCallback, useState, useSyncExternalStore } from "react";
import {
  consumeInstallPrompt,
  getInstalledSnapshot,
  getPromptSnapshot,
  subscribeInstallPrompt,
} from "@/shared/pwa/installPromptStore";
import { isIos, isRunningStandalone } from "@/shared/pwa/platform";

const DISMISSED_KEY = "pwa-install-dismissed-at";
const DISMISS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const readDismissed = () => {
  const raw = localStorage.getItem(DISMISSED_KEY);
  if (!raw) return false;

  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) {
    localStorage.removeItem(DISMISSED_KEY);
    return false;
  }

  return Date.now() - dismissedAt < DISMISS_WINDOW_MS;
};

export type InstallPromptMode = "hidden" | "prompt" | "ios-instructions";

export const useInstallPrompt = () => {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getPromptSnapshot,
  );
  const installed = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstalledSnapshot,
  );
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    const outcome = await consumeInstallPrompt();
    // Rechazar el diálogo nativo también silencia el banner 14 días.
    if (outcome === "dismissed") dismiss();
    return outcome;
  }, [dismiss]);

  // En iPhone, las instrucciones en cualquier navegador: desde iOS 16.4 no
  // solo Safari puede añadir la app a la pantalla de inicio.
  const mode: InstallPromptMode =
    installed || isRunningStandalone() || dismissed
      ? "hidden"
      : deferredPrompt
        ? "prompt"
        : isIos()
          ? "ios-instructions"
          : "hidden";

  return { mode, install, dismiss };
};
