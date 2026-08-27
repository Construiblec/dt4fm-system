import {
  Bell,
  BrushCleaning,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type NotificationStyle = {
  icon: LucideIcon;
  /** Clases de color del icono y su fondo. */
  text: string;
  soft: string;
};

/**
 * Icono y color por tipo. El backend solo manda el `type` estable; cómo se
 * pinta es cosa del frontend.
 *
 * Las claves son las de `NOTIFICATION_TYPES` del backend: al añadir un tipo
 * allí, se añade aquí. Uno desconocido no rompe nada, cae al estilo por defecto.
 */
export const NOTIFICATION_STYLES: Record<string, NotificationStyle> = {
  "corrective.opened": {
    icon: Megaphone,
    text: "text-red-700",
    soft: "bg-red-50",
  },
  "corrective.assigned": {
    icon: ClipboardList,
    text: "text-blue-700",
    soft: "bg-blue-50",
  },
  "corrective.completed": {
    icon: CheckCircle2,
    text: "text-emerald-700",
    soft: "bg-emerald-50",
  },
  "preventive.planning-30d": {
    icon: CalendarClock,
    text: "text-amber-700",
    soft: "bg-amber-50",
  },
  "preventive.planning-2d": {
    icon: Clock,
    text: "text-amber-700",
    soft: "bg-amber-50",
  },
  "preventive.assigned": {
    icon: Wrench,
    text: "text-blue-700",
    soft: "bg-blue-50",
  },
  "preventive.suspended": {
    icon: PauseCircle,
    text: "text-orange-700",
    soft: "bg-orange-50",
  },
  "preventive.resumed": {
    icon: PlayCircle,
    text: "text-teal-700",
    soft: "bg-teal-50",
  },
  "cleaning.assigned": {
    icon: BrushCleaning,
    text: "text-violet-700",
    soft: "bg-violet-50",
  },
  "cleaning.delayed": {
    icon: Clock,
    text: "text-amber-700",
    soft: "bg-amber-50",
  },
  "cleaning.completed": {
    icon: CheckCircle2,
    text: "text-emerald-700",
    soft: "bg-emerald-50",
  },
};

const DEFAULT_STYLE: NotificationStyle = {
  icon: Bell,
  text: "text-slate-600",
  soft: "bg-slate-100",
};

export const getNotificationStyle = (type: string): NotificationStyle =>
  NOTIFICATION_STYLES[type] ?? DEFAULT_STYLE;