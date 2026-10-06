import { useEffect, useState } from "react";
import { fetchCleaningEmployees } from "@/modules/coordinador/services/coordinadorService";
import type { CleaningEmployee } from "@/modules/coordinador/types/Coordinador";

/** Lista de empleados candidatos a asignación, cargada una vez por pantalla. */
export const useEmployees = () => {
  const [employees, setEmployees] = useState<CleaningEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchCleaningEmployees()
      .then((data) => {
        if (isMounted) setEmployees(data);
      })
      .catch(() => {
        if (isMounted) setError("No se pudieron cargar los empleados");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { employees, loading, error };
};
