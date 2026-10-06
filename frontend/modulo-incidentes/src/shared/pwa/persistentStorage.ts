import { isRunningStandalone } from "@/shared/pwa/platform";

/**
 * Pide al navegador que no borre el almacenamiento de la app, que es donde
 * vive la sesión, cuando el dispositivo ande corto de espacio.
 *
 * Solo en la app instalada: es donde importa y donde Chrome lo concede sin
 * preguntar. En una pestaña de Firefox, en cambio, saldría un diálogo de
 * permiso que nadie entendería.
 */
export const requestPersistentStorage = async () => {
  if (!isRunningStandalone()) return;

  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;

    await navigator.storage.persist();
  } catch {
    // Sin soporte o denegado: la sesión sigue en localStorage como siempre.
  }
};
