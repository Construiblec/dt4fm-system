import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSupervision } from "@/modules/supervisor/services/supervisionService";
import type { SupervisionDetail } from "@/modules/supervisor/types/Supervision";

export const supervisionKey = (id: number) => ["cleaning-supervision", id];

/**
 * Detalle de una supervisión. Las cuatro pantallas comparten la misma entrada
 * de caché, así que pasar del checklist a asignar no vuelve a esperar la red.
 */
export const useSupervision = (id: number) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: supervisionKey(id),
    queryFn: async () => (await fetchSupervision(id)).data,
    enabled: Number.isFinite(id) && id > 0,
  });

  return {
    ...query,
    supervision: query.data ?? null,
    /** Deja la respuesta de una acción como el detalle vigente. */
    setSupervision: (detail: SupervisionDetail) =>
      queryClient.setQueryData(supervisionKey(id), detail),
    reload: () =>
      queryClient.invalidateQueries({ queryKey: supervisionKey(id) }),
  };
};
