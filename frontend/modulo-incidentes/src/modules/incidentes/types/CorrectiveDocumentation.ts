import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";

/** Mismo contrato que los adjuntos del preventivo. */
export type MaintenanceAttachment = PreventiveMaintenanceAttachment;

export type CorrectiveEquipment = {
  id: number;
  code: string | null;
  description: string | null;
  place: string | null;
};

export type EquipmentHistoryEntry = {
  id: number;
  kind: "corrective" | "preventive";
  number: string | null;
  subject: string | null;
  closedAt: string | null;
  attachmentCount: number;
};
