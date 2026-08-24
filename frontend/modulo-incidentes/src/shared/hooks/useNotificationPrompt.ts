import { useCallback, useEffect, useState } from "react";
import { hasActiveSession, isVisitorSession } from "@/shared/auth/session";
import { isIos, isRunningStandalone } from "@/shared/pwa/platform";
import {
  describePushError,
  isPushSupported,
  subscribeToPush,
} from "@/shared/pwa/pushSubscription";

const DISMISSED_KEY = "push-prompt-dismissed-at";
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

const readPermission = (): NotificationPermission =>
  isPushSupported() ? Notification.permission : "denied";

export type NotificationPromptMode = "hidden" | "prompt" | "error";

/**
 * Pre-prompt propio, mismo patrón que useInstallPrompt.
 *
 * El permiso nativo se pide SOLO desde `enable()`, nunca al montar: el
 * navegador da una única oportunidad y, si el usuario bloquea, no se puede
 * volver a preguntar por código: tendría que ir a los ajustes del navegador.
 */
export const useNotificationPrompt = () => {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [permission, setPermission] =
    useState<NotificationPermission>(readPermission);
  const [error, setError] = useState<string | null>(null);

  // Con el permiso ya concedido se re-registra en silencio: cubre el login en
  // un dispositivo que ya lo tenía y la rotación del endpoint por el navegador.
  useEffect(() => {
    if (permission !== "granted" || !hasActiveSession()) return;

    void subscribeToPush().catch((cause) => {
      console.error("[push] re-registro automático fallido:", cause);
      setError(describePushError(cause));
    });
  }, [permission]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
    setError(null);
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result !== "granted") {
      // Rechazar el diálogo nativo también silencia el banner 14 días.
      dismiss();
      return;
    }

    try {
      await subscribeToPush();
    } catch (cause) {
      console.error("[push] alta fallida:", cause);
      setError(describePushError(cause));
    }
  }, [dismiss]);

  const mode: NotificationPromptMode = (() => {
    if (!isPushSupported()) return "hidden";
    if (!hasActiveSession() || isVisitorSession()) return "hidden";
    if (error) return "error";
    // "denied" es terminal: insistir no sirve de nada.
    if (permission !== "default") return "hidden";
    if (dismissed) return "hidden";
    // Safari solo entrega push si la PWA está en la pantalla de inicio.
    if (isIos() && !isRunningStandalone()) return "hidden";
    return "prompt";
  })();

  return { mode, error, enable, dismiss };
};