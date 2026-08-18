export type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

/**
 * Los listeners se registran al evaluar el módulo, no en un efecto: el
 * navegador dispara `beforeinstallprompt` antes de que React monte y el evento
 * se pierde si nadie lo está esperando.
 */
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  emit();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  installed = true;
  emit();
});

export const subscribeInstallPrompt = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getPromptSnapshot = () => deferredPrompt;
export const getInstalledSnapshot = () => installed;

/** El evento diferido es de un solo uso: una vez mostrado, se descarta. */
export const consumeInstallPrompt = async () => {
  const event = deferredPrompt;
  if (!event) return "unavailable" as const;

  await event.prompt();
  const { outcome } = await event.userChoice;
  deferredPrompt = null;
  emit();
  return outcome;
};
