import { useEffect, useState } from "react";
import { getPreventiveMaintenanceHistory } from "@/modules/incidentes/services/preventiveMaintenanceService";
import type { PreventiveMaintenanceHistoryEntry } from "@/modules/incidentes/types/PreventiveMaintenance";

type Result = {
  entries: PreventiveMaintenanceHistoryEntry[];
  loading: boolean;
  error: string | null;
};

/**
 * Carga los mantenimientos anteriores del equipo.
 *
 * @param enabled Difiere la petición hasta entrar a la pestaña que los muestra.
 * Al fallar no marca la carga como hecha, así que reabrirla vuelve a intentarlo.
 */
export const usePreventiveMaintenanceHistory = (
  id: string,
  enabled: boolean,
): Result => {
  const [entries, setEntries] = useState<PreventiveMaintenanceHistoryEntry[]>(
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

        const data = await getPreventiveMaintenanceHistory(id);

        if (isMounted) {
          setEntries(data);
          setHasLoaded(true);
        }
      } catch {
        if (isMounted) {
          setError("No se pudo cargar el historial del equipo");
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

  return { entries, loading, error };
};
