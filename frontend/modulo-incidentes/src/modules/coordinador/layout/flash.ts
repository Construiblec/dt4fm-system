import { create } from "zustand";
import type { AlertTone } from "../components/ui";

/**
 * Avisos arriba del contenido (la app no tiene toasts: son cajas en línea).
 * Viven en un store porque quien los dispara (la ficha, un formulario) no es
 * quien los pinta (la barra de la pantalla), y sobreviven a un cambio de pantalla.
 */
type Flash = { id: number; tone: AlertTone; text: string };

type FlashState = {
  flash: Flash | null;
  show: (tone: AlertTone, text: string) => void;
  clear: () => void;
};

let timer: number | undefined;

export const useCoordFlash = create<FlashState>((set) => ({
  flash: null,
  show: (tone, text) => {
    window.clearTimeout(timer);
    set({ flash: { id: Date.now(), tone, text } });
    timer = window.setTimeout(() => set({ flash: null }), 10_000);
  },
  clear: () => {
    window.clearTimeout(timer);
    set({ flash: null });
  },
}));
