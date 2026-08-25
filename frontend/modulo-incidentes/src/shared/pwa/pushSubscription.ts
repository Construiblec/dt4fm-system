import axios from "axios";
import { env } from "@/config/env";

const API_URL = env.VITE_API_URL.replace(/\/api\/?$/, "");

const api = axios.create({ baseURL: API_URL });

const SW_READY_TIMEOUT_MS = 10_000;

export class PushSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushSetupError";
  }
}

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

const fetchVapidPublicKey = async (): Promise<string> => {
  const { data } = await api.get<{ publicKey?: string }>(
    "/push/vapid-public-key",
  );

  if (!data?.publicKey) {
    throw new PushSetupError(
      "El servidor no tiene configuradas las claves de notificación (VAPID).",
    );
  }

  return data.publicKey;
};

const resolveRegistration = async (): Promise<ServiceWorkerRegistration> => {
  const existing = await navigator.serviceWorker.getRegistration();

  if (!existing) {
    throw new PushSetupError(
      "No hay service worker registrado. En desarrollo hay que levantar el " +
        "frontend con `npm run dev:pwa`; `npm run dev` no lo registra.",
    );
  }

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new PushSetupError(
              "El service worker no terminó de activarse. Recarga la página " +
                "e inténtalo de nuevo.",
            ),
          ),
        SW_READY_TIMEOUT_MS,
      ),
    ),
  ]);
};

/**
 * Suscribe este dispositivo y registra la suscripción en el backend. Asume que
 * el permiso ya fue concedido: pedirlo es responsabilidad del pre-prompt.
 *
 * Lanza `PushSetupError` con un motivo legible: activar notificaciones y que
 * no pase nada, sin explicación, es imposible de diagnosticar.
 */
export const subscribeToPush = async (): Promise<void> => {
  if (!isPushSupported()) {
    throw new PushSetupError("Este navegador no admite notificaciones push.");
  }

  if (!localStorage.getItem("sessionId")) {
    throw new PushSetupError(
      "No hay sesión iniciada. Inicia sesión para activar las notificaciones.",
    );
  }

  const [registration, vapidPublicKey] = await Promise.all([
    resolveRegistration(),
    fetchVapidPublicKey(),
  ]);

  // Si ya existe se reutiliza: volver a suscribir con la misma clave devuelve
  // el mismo endpoint, y el backend hace upsert.
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const payload = subscription.toJSON();

  await api.post(
    "/push/subscribe",
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: payload.keys?.p256dh, auth: payload.keys?.auth },
      userAgent: navigator.userAgent,
    },
    { headers: authHeaders() },
  );
};

/** Mensaje presentable a partir de cualquier fallo del alta. */
export const describePushError = (error: unknown): string => {
  if (error instanceof PushSetupError) return error.message;

  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      return "La sesión caducó. Vuelve a iniciar sesión.";
    }
    return "No se pudo contactar con el servidor para registrar el dispositivo.";
  }

  return "No se pudieron activar las notificaciones.";
};

/**
 * Da de baja el dispositivo. Se llama al cerrar sesión: el endpoint pertenece
 * al navegador, así que si no se borra el siguiente usuario de este mismo
 * teléfono heredaría los avisos del anterior.
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