import { useCallback, useState } from "react";
import {
  fetchUpcomingCleanings,
  syncToday,
} from "@/modules/coordinador/services/coordinadorService";
import type {
  CheckoutItem,
  SyncResult,
} from "@/modules/coordinador/types/Coordinador";

export const useSync = () => {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const [upcoming, setUpcoming] = useState<CheckoutItem[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const runSyncToday = useCallback(async () => {
    try {
      setSyncing(true);
      setSyncError(null);
      const result = await syncToday();
      setLastResult(result);
      return result;
    } catch {
      setSyncError("No se pudo sincronizar con Hostaway");
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

  const loadUpcoming = useCallback(async (dateFrom: string, dateTo: string) => {
    try {
      setLoadingUpcoming(true);
      setUpcomingError(null);
      const response = await fetchUpcomingCleanings(dateFrom, dateTo);
      setUpcoming(response.checkouts);
    } catch {
      setUpcomingError("No se pudieron cargar las próximas limpiezas");
    } finally {
      setLoadingUpcoming(false);
    }
  }, []);

  return {
    syncing,
    syncError,
    lastResult,
    runSyncToday,
    upcoming,
    loadingUpcoming,
    upcomingError,
    loadUpcoming,
  };
};
