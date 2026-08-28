import { CheckCircle2, XCircle, Wrench } from "lucide-react";
import type { CommonArea } from "@/services/api";

/** El mantenimiento manda sobre la disponibilidad al pintar el estado del área. */
export const badgeFor = (area: CommonArea) => {
  if (area.enMantenimiento)
    return {
      label: "En mantenimiento",
      className: "bg-amber-100 text-amber-700",
      icon: <Wrench className="h-3.5 w-3.5" />,
    };
  if (area.estado === "Reservado")
    return {
      label: "Reservado",
      className: "bg-red-100 text-red-700",
      icon: <XCircle className="h-3.5 w-3.5" />,
    };
  return {
    label: "Libre",
    className: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  };
};
