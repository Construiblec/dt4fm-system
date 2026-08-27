import { create } from "zustand";
import { getUnreadCount } from "@/modules/notificaciones/services/notificationsService";

/**
 * Contador de avisos sin leer, reactivo.
 *
 * Vive en un store y no dentro de la campana porque lo escriben dos sitios: la
 * campana al refrescarlo y la pantalla de notificaciones al marcar como leído.
 * Sin esto, el badge seguiría mostrando el número viejo tras leerlas.
 */
type NotificationsState = {
  unread: number;
  setUnread: (unread: number) => void;
  refreshUnread: () => Promise<void>;
};

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unread: 0,

  setUnread: (unread) => set({ unread: Math.max(0, unread) }),

  // Silencioso a propósito: un fallo al contar no debe romper la cabecera.
  refreshUnread: async () => {
    try {
      set({ unread: await getUnreadCount() });
    } catch {
      // Se conserva el último valor conocido.
    }
  },
}));