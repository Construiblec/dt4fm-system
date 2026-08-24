import axios from "axios";
import { env } from "@/config/env";

const API_URL = env.VITE_API_URL.replace(/\/api\/?$/, "");

const api = axios.create({ baseURL: API_URL });

/** La Push API espera la clave VAPID como bytes, no como el base64url del env. */
const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);

  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
};

export const isPushSupported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const authHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
  "x-role": localStorage.getItem("role") ?? "",
});

/**
 * Suscribe este dispositivo y registra la suscripción en el backend. Asume que
 * el permiso ya fue concedido: pedirlo es responsabilidad del pre-prompt.
 */
export const subscribeToPush = async (): Promise<boolean> => {
  if (!isPushSupported() || !env.VITE_VAPID_PUBLIC_KEY) return false;

  const userId = localStorage.getItem("userId");
  if (!userId) return false;

  const registration = await navigator.serviceWorker.ready;

  // Si ya existe se reutiliza: volver a suscribir con la misma clave devuelve
  // el mismo endpoint, y el backend hace upsert.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(env.VITE_VAPID_PUBLIC_KEY),
    }));

  const payload = subscription.toJSON();

  await api.post(
    "/push/subscribe",
    {
      userId,
      endpoint: subscription.endpoint,
      keys: { p256dh: payload.keys?.p256dh, auth: payload.keys?.auth },
      userAgent: navigator.userAgent,
    },
    { headers: authHeaders() },
  );

  return true;
};

/**
 * Da de baja el dispositivo. Se llama al cerrar sesión: el endpoint pertenece
 * al navegador, así que si no se borra el siguiente usuario de este mismo
 * teléfono heredaría las notificaciones del anterior.
 */
export const unsubscribeFromPush = async (): Promise<void> => {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    await api
      .delete("/push/subscribe", {
        data: { endpoint: subscription.endpoint },
        headers: authHeaders(),
      })
      .catch(() => undefined);

    await subscription.unsubscribe();
  } catch {
    // Cerrar sesión nunca debe fallar por esto.
  }
};
