import { useCallback, useEffect, useState } from "react";
import {
  getApiErrorMessage,
  listAuthorizations,
} from "@/modules/supervisor-cav/services/authorizationsService";
import type { Authorization } from "@/modules/supervisor-cav/types/Authorization";
import { toIsoDate } from "@/shared/utils/dateTimeInput";

/** Rango inicial: hoy hasta dentro de una semana, la ventana operativa típica. */
const defaultRange = () => {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  return {
    from: toIsoDate(today.getFullYear(), today.getMonth(), today.getDate()),
    to: toIsoDate(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate()),
  };
};

export const useAuthorizations = () => {
  const initial = defaultRange();

  const [items, setItems] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await listAuthorizations({ from, to });
      setItems(response.data);
    } catch (err) {
      setItems([]);
      setError(
        getApiErrorMessage(err, "No se pudieron cargar los próximos check-ins"),
      );
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Se aplica al pulsar «Filtrar», no al teclear cada fecha. */
  const applyDateRange = useCallback((nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
  }, []);

  return { items, loading, error, from, to, applyDateRange, reload: load };
};
