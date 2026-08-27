/**
 * Notificación tal como la devuelve el backend. El icono y los colores no
 * viajan: se derivan de `type` en `notificationStyles`, que es presentación.
 */
export type AppNotification = {
  id: string;
  /** Tipo estable, p. ej. `corrective.opened`. */
  type: string;
  title: string;
  body: string;
  /** Ruta interna a la que lleva al pulsarla; puede no tener destino. */
  deepLink: string | null;
  entityKind: string | null;
  entityId: string | null;
  createdAt: string;
  read: boolean;
};