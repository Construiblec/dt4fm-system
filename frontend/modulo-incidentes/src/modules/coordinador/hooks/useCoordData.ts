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

/** Todo lo de la coordinación cuelga de esta raíz: un solo `invalidate` refresca cualquier pantalla. */
export const COORD_KEY = ["coord"] as const;

export const useInvalidateCoord = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: COORD_KEY });
};

export const useCoordTasks = () =>
  useQuery({
    queryKey: [...COORD_KEY, "tasks"],
    queryFn: fetchAllTasks,
    staleTime: 15_000,
  });

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
