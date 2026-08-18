import { useCallback, useState, useSyncExternalStore } from "react";
import {
  consumeInstallPrompt,
  getInstalledSnapshot,
  getPromptSnapshot,
  subscribeInstallPrompt,
} from "@/shared/pwa/installPromptStore";

const DISMISSED_KEY = "pwa-install-dismissed-at";
const DISMISS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Ya instalada: iOS lo expone en navigator.standalone; el resto, display-mode. */
const isRunningStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: window-controls-overlay)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPadOS 13+ se anuncia como Macintosh; se distingue por los puntos tactiles. */
const isIos = () => {
  const ua = window.navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1)
  );
};

/** Solo Safari en iOS ofrece "Anadir a pantalla de inicio". */
const isIosSafari = () =>
  isIos() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(window.navigator.userAgent);

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
    // Rechazar el dialogo nativo tambien silencia el banner 14 dias.
    if (outcome === "dismissed") dismiss();
    return outcome;
  }, [dismiss]);

  const mode: InstallPromptMode =
    installed || isRunningStandalone() || dismissed
      ? "hidden"
      : deferredPrompt
        ? "prompt"
        : isIosSafari()
          ? "ios-instructions"
          : "hidden";

  return { mode, install, dismiss };
};
