import { useEffect, useState } from "react";
import { getMyPreventiveMaintenances } from "@/modules/incidentes/services/preventiveMaintenanceService";
import type { PreventiveMaintenance } from "@/modules/incidentes/types/PreventiveMaintenance";

type Result = {
  maintenances: PreventiveMaintenance[];
  loading: boolean;
  error: string | null;
};

/**
 * Carga los mantenimientos preventivos asignados al empleado autenticado.
 *
 * @param enabled Difiere la petición hasta que la vista se necesita, para no
 * añadir una llamada al montar el dashboard.
 */
export const useMyPreventiveMaintenances = (enabled: boolean): Result => {
  const [maintenances, setMaintenances] = useState<PreventiveMaintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || hasLoaded) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getMyPreventiveMaintenances();

        if (isMounted) {
          setMaintenances(data);
          setHasLoaded(true);
        }
      } catch {
        if (isMounted) {
          setError("No se pudieron cargar los mantenimientos preventivos");
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
  }, [enabled, hasLoaded]);

  return { maintenances, loading, error };
};
