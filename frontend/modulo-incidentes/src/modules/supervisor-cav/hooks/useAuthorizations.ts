import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listAuthorizations } from "@/modules/supervisor-cav/services/authorizationsService";
import { getApiErrorMessage } from "@/modules/supervisor-cav/services/cavApi";
import type { Authorization } from "@/modules/supervisor-cav/types/Authorization";
import { toIsoDate } from "@/shared/utils/dateTimeInput";

/** Rango inicial: hoy hasta dentro de una semana, la ventana operativa típica. */
const defaultRange = () => {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  return {
    from: toIsoDate(today.getFullYear(), today.getMonth(), today.getDate()),
    to: toIsoDate(
      nextWeek.getFullYear(),
      nextWeek.getMonth(),
      nextWeek.getDate(),
    ),
  };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** El rango vive en la URL para que sobreviva a entrar al detalle y volver. */
export const useAuthorizations = () => {
  const [params, setParams] = useSearchParams();
  const initial = defaultRange();
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam && ISO_DATE.test(fromParam) ? fromParam : initial.from;
  const to = toParam && ISO_DATE.test(toParam) ? toParam : initial.to;

  const [items, setItems] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const applyDateRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      setParams({ from: nextFrom, to: nextTo }, { replace: true });
    },
    [setParams],
  );

  return { items, loading, error, from, to, applyDateRange, reload: load };
};
