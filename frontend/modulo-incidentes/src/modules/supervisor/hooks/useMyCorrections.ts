import axios from "axios";
import { useQuery } from "@tanstack/react-query";
import { fetchMyCorrections } from "@/modules/supervisor/services/supervisionService";
import type { MyCorrection } from "@/modules/supervisor/types/Supervision";

export const myCorrectionsKey = ["cleaning-corrections", "mine"] as const;

/**
 * Las correcciones en curso del operario conectado (`InCorrection` y suyas).
 * Un 403 significa que el usuario no es operario de limpieza (por ejemplo, un
 * técnico de mantenimiento): no tiene correcciones, no es un error.
 */
export const useMyCorrections = (enabled: boolean) => {
  const query = useQuery({
    queryKey: myCorrectionsKey,
    queryFn: async (): Promise<MyCorrection[]> => {
      try {
        return (await fetchMyCorrections()).data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          return [];
        }
        throw error;
      }
    },
    enabled,
  });

  return { ...query, corrections: query.data ?? [] };
};
