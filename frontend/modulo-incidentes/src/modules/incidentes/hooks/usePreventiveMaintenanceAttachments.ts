import { useEffect, useState } from "react";
import { getPreventiveMaintenanceAttachments } from "@/modules/incidentes/services/preventiveMaintenanceService";
import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";

type Result = {
  /** Documentos que adjuntó el técnico */
  documents: PreventiveMaintenanceAttachment[];
  /** Informes que generó OpenMAINT al cerrar el mantenimiento */
  reports: PreventiveMaintenanceAttachment[];
  loading: boolean;
  error: string | null;
  /** Reemplaza la lista tras una subida, sin volver a pedirla */
  replace: (attachments: PreventiveMaintenanceAttachment[]) => void;
};

/**
 * Archivos adjuntos de la tarjeta del mantenimiento, separados entre lo que
 * subió el técnico y el informe que genera OpenMAINT al cerrarlo.
 *
 * @param enabled Difiere la petición hasta que la vista los necesita.
 */
export const usePreventiveMaintenanceAttachments = (
  id: string,
  enabled: boolean,
): Result => {
  const [attachments, setAttachments] = useState<
    PreventiveMaintenanceAttachment[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || !id || hasLoaded) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getPreventiveMaintenanceAttachments(id);

        if (isMounted) {
          setAttachments(data);
          setHasLoaded(true);
        }
      } catch {
        if (isMounted) {
          setError("No se pudieron cargar los archivos del mantenimiento");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [enabled, id, hasLoaded]);

  return {
    documents: attachments.filter((attachment) => !attachment.isReport),
    reports: attachments.filter((attachment) => attachment.isReport),
    loading,
    error,
    replace: setAttachments,
  };
};
