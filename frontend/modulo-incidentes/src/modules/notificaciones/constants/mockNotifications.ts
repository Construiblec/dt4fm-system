import {
  ClipboardList,
  Clock,
  KeyRound,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

/**
 * DATOS DE PRUEBA — PROVISIONAL.
 *
 * Todavía no está decidido dónde se guardan las notificaciones (clase propia en
 * openMAINT, tabla aparte, o derivadas de los procesos existentes), así que la
 * pantalla se monta contra este mock para poder cerrar el diseño.
 *
 * Al conectarlo de verdad: sustituir por un servicio en
 * `modules/notificaciones/services/` y borrar este archivo. La forma de
 * `AppNotification` es lo único que debería sobrevivir.
 */

export type AppNotification = {
  id: number;
  icon: LucideIcon;
  /** Clases de color del icono y su fondo. */
  text: string;
  soft: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 1,
    icon: ClipboardList,
    text: "text-blue-700",
    soft: "bg-blue-50",
    title: "Nueva tarea asignada",
    body: "CM.2026.0151 · B - Batán",
    time: "hace 5 min",
    unread: true,
  },
  {
    id: 2,
    icon: Clock,
    text: "text-amber-700",
    soft: "bg-amber-50",
    title: "Tarea por vencer",
    body: "LIMPIEZA - I27 vence hoy a las 18:00",
    time: "hace 1 h",
    unread: true,
  },
  {
    id: 3,
    icon: Megaphone,
    text: "text-red-700",
    soft: "bg-red-50",
    title: "Novedad reportada",
    body: "Fuga en cisterna · Estudio 14",
    time: "ayer",
    unread: true,
  },
  {
    id: 4,
    icon: KeyRound,
    text: "text-teal-700",
    soft: "bg-teal-50",
    title: "Contraseña actualizada",
    body: "Cambio realizado desde este dispositivo",
    time: "12 ago",
    unread: false,
  },
];

export const unreadCount = (notifications: AppNotification[]) =>
  notifications.filter((notification) => notification.unread).length;
