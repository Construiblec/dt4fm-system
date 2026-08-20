import { useCallback, useEffect, useState } from "react";
import {
  getApiErrorMessage,
  listMaintenances,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  MaintenanceKind,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";

export const ITEMS_PER_PAGE = 10;

/**
 * Listado del supervisor con **paginación en servidor**.
 *
 * A diferencia del dashboard del técnico (que trae 50 y recorta en cliente con
 * `useListPagination`), aquí el listado abarca todos los mantenimientos de la
 * instancia — 364 preventivos solo en planificación —, así que la página tiene
 * que pedirse al backend.
 */
export const useSupervisedMaintenances = (kind: MaintenanceKind) => {
  const [items, setItems] = useState<SupervisedMaintenance[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingReview, setPendingReview] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await listMaintenances(kind, {
        status: status === "ALL" ? undefined : status,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
      });

      setItems(response.data);
      setTotal(response.meta.total);
      setPendingReview(response.meta.pendingReview);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(
        getApiErrorMessage(err, "No se pudieron cargar los mantenimientos"),
      );
    } finally {
      setLoading(false);
    }
  }, [kind, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Cambiar de tipo o de filtro invalida la página actual. */
  const changeStatus = useCallback((next: string) => {
    setStatus(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setStatus("ALL");
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  return {
    items,
    total,
    pendingReview,
    loading,
    error,
    status,
    changeStatus,
    clearFilters,
    page,
    // Si el backend devolvió menos páginas de las que teníamos, no dejamos la
    // vista en una página que ya no existe.
    setPage: (next: number) => setPage(Math.min(Math.max(1, next), totalPages)),
    totalPages,
    reload: load,
  };
};
