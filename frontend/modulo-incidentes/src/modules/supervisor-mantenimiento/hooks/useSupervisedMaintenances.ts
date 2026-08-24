import { useCallback, useEffect, useState } from "react";
import {
  getApiErrorMessage,
  listMaintenances,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  MaintenanceKind,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { endOfDayIso, startOfDayIso } from "@/shared/utils/dateTimeInput";

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
  const [unassigned, setUnassigned] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  // Rango de inicio previsto, en `YYYY-MM-DD`. Solo lo usa el preventivo: el
  // correctivo nace de una incidencia y no se programa.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await listMaintenances(kind, {
        status: status === "ALL" ? undefined : status,
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
        ...(kind === "preventive"
          ? { from: startOfDayIso(from), to: endOfDayIso(to) }
          : {}),
      });

      setItems(response.data);
      setTotal(response.meta.total);
      setPendingReview(response.meta.pendingReview);
      setUnassigned(response.meta.unassigned);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setUnassigned(null);
      setError(
        getApiErrorMessage(err, "No se pudieron cargar los mantenimientos"),
      );
    } finally {
      setLoading(false);
    }
  }, [kind, status, page, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Cambiar de tipo o de filtro invalida la página actual. */
  const changeStatus = useCallback((next: string) => {
    setStatus(next);
    setPage(1);
  }, []);

  /**
   * Se aplica al pulsar «Filtrar», no al teclear: mientras se escribe una
   * fecha pasa por estados incompletos que dispararían consultas inútiles.
   */
  const applyDateRange = useCallback((nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setStatus("ALL");
    setFrom("");
    setTo("");
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  return {
    items,
    total,
    pendingReview,
    unassigned,
    loading,
    error,
    status,
    changeStatus,
    from,
    to,
    applyDateRange,
    clearFilters,
    page,
    // Si el backend devolvió menos páginas de las que teníamos, no dejamos la
    // vista en una página que ya no existe.
    setPage: (next: number) => setPage(Math.min(Math.max(1, next), totalPages)),
    totalPages,
    reload: load,
  };
};
