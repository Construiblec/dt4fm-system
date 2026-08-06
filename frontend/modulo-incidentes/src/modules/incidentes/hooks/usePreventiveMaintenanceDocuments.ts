import { useEffect, useState } from "react";
import { getPreventiveMaintenanceDocuments } from "@/modules/incidentes/services/preventiveMaintenanceService";
import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";

type Result = {
  documents: PreventiveMaintenanceAttachment[];
  loading: boolean;
  error: string | null;
};

/**
 * Manuales y fichas técnicas del equipo.
 *
 * @param enabled Difiere la petición hasta entrar a la pestaña que los muestra.
 * Al fallar no marca la carga como hecha, así que reabrirla vuelve a intentarlo.
 */
export const usePreventiveMaintenanceDocuments = (
  id: string,
  enabled: boolean,
): Result => {
  const [documents, setDocuments] = useState<PreventiveMaintenanceAttachment[]>(
    [],
  );
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

        const data = await getPreventiveMaintenanceDocuments(id);

        if (isMounted) {
          setDocuments(data);
          setHasLoaded(true);
        }
      } catch {
        if (isMounted) {
          setError("No se pudieron cargar los documentos del equipo");
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

  return { documents, loading, error };
};
