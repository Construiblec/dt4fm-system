import { BookOpen } from "lucide-react";
import { AttachmentListSection } from "@/modules/incidentes/components/AttachmentListSection";
import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";

type Props = {
  documents: PreventiveMaintenanceAttachment[];
  loading: boolean;
  error: string | null;
};

/**
 * Documentación del equipo intervenido. Son los archivos del manual de
 * mantenimiento al que apunta el plan preventivo, no los que adjunta el
 * técnico durante la ejecución.
 */
export const PreventiveDocumentsSection = ({
  documents,
  loading,
  error,
}: Props) => (
  <AttachmentListSection
    icon={BookOpen}
    title="Documentos del equipo"
    subtitle="Manuales y fichas técnicas del equipo intervenido."
    attachments={documents}
    emptyMessage="Este equipo todavía no tiene documentos disponibles."
    loading={loading}
    error={error}
  />
);
