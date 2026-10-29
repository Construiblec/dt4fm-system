import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBuildingLocations,
  getBuildings,
} from "@/modules/incidentes/services/buildingsService";
import {
  fetchAllTasks,
  fetchChecklists,
  fetchCheckoutPreview,
  fetchEmployees,
  fetchTaskDetail,
} from "../services/coordinadorService";
import { isPending } from "../domain/tasks";
import type { CoordTask } from "../types/Coordinador";

/** Todo lo de la coordinación cuelga de esta raíz: un solo `invalidate` refresca cualquier pantalla. */
export const COORD_KEY = ["coord"] as const;

/** La lista de limpiezas: la que pintan el tablero, las listas y el contador del menú. */
const TASKS_KEY = [...COORD_KEY, "tasks"] as const;

export const useInvalidateCoord = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: COORD_KEY });
};

export const useCoordTasks = () =>
  useQuery({
    queryKey: TASKS_KEY,
    queryFn: fetchAllTasks,
    staleTime: 15_000,
  });

/** Guardados de limpiezas en vuelo: la recarga espera al último (ver abajo). */
let savesInFlight = 0;

/**
 * Guarda cambios de limpiezas pintándolos ANTES de que responda el servidor.
 *
 * Esperar la respuesta y recargar todo después era lo lento del tablero: cada
 * asignación tardaba 1–2 s en verse (~0,7 s guardar en openMAINT, más recargar
 * limpiezas, empleados y checklists; los checklists solos, ~1,8 s). Ahora el
 * cambio se ve al instante, la limpieza cuyo guardado falla vuelve a como
 * estaba, y después se recargan solo las limpiezas, en segundo plano.
 *
 * La recarga espera a que no quede ningún guardado en vuelo: si volviera antes
 * que el de otra tarjeta, traería la lista sin ese cambio y la tarjeta saltaría
 * atrás un momento.
 */
export const useSaveCoordTasks = () => {
  const queryClient = useQueryClient();

  return async (
    ids: number[],
    patch: Partial<CoordTask>,
    save: (id: number) => Promise<unknown>,
  ): Promise<PromiseSettledResult<unknown>[]> => {
    savesInFlight += 1;
    try {
      // Una recarga en vuelo traería la lista de antes y desharía el cambio.
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const before = new Map(
        (queryClient.getQueryData<CoordTask[]>(TASKS_KEY) ?? [])
          .filter((task) => ids.includes(task.id))
          .map((task) => [task.id, task]),
      );
      queryClient.setQueryData<CoordTask[]>(TASKS_KEY, (old) =>
        old?.map((task) => (ids.includes(task.id) ? { ...task, ...patch } : task)),
      );

      const results = await Promise.allSettled(ids.map(save));
      const failed = ids.filter((_, i) => results[i].status === "rejected");
      if (failed.length) {
        queryClient.setQueryData<CoordTask[]>(TASKS_KEY, (old) =>
          old?.map((task) =>
            failed.includes(task.id) ? (before.get(task.id) ?? task) : task,
          ),
        );
      }
      return results;
    } finally {
      savesInFlight -= 1;
      if (savesInFlight === 0) {
        void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      }
    }
  };
};

export const useTaskDetail = (id: number | null) =>
  useQuery({
    queryKey: [...COORD_KEY, "task", id],
    queryFn: () => fetchTaskDetail(id as number),
    enabled: id !== null,
  });

export const useEmployees = () =>
  useQuery({
    queryKey: [...COORD_KEY, "employees"],
    queryFn: fetchEmployees,
    staleTime: 5 * 60_000,
  });

export const useChecklists = () =>
  useQuery({
    queryKey: [...COORD_KEY, "checklists"],
    queryFn: fetchChecklists,
  });

export const useCheckoutPreview = (dateFrom: string, dateTo: string) =>
  useQuery({
    queryKey: [...COORD_KEY, "preview", dateFrom, dateTo],
    queryFn: () => fetchCheckoutPreview(dateFrom, dateTo),
    // Hostaway es una llamada externa y lenta: no se repite al volver a la pestaña.
    // Un fallo suelto se reintenta solo (la pantalla sigue en "cargando") y el
    // error solo se muestra si insiste.
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt) => 1_000 * (attempt + 1),
    refetchOnWindowFocus: false,
  });

export const useBuildings = () =>
  useQuery({
    queryKey: [...COORD_KEY, "buildings"],
    queryFn: getBuildings,
    staleTime: 10 * 60_000,
  });

export const useBuildingLocations = (buildingId: number | null) =>
  useQuery({
    queryKey: [...COORD_KEY, "locations", buildingId],
    queryFn: () => getBuildingLocations(buildingId as number),
    enabled: buildingId !== null,
    staleTime: 10 * 60_000,
  });

/** El contador del menú: cuántas limpiezas siguen sin empleado o sin horario. */
export const usePendingCount = (): number | null => {
  const { data } = useCoordTasks();
  return useMemo(() => (data ? data.filter(isPending).length : null), [data]);
};
