import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getGuestPortalData,
  isGuestLinkInvalid,
} from "../services/guestPortalService";

const DAY_MS = 24 * 60 * 60 * 1000;

export const useGuestPortal = (token: string) => {
  const query = useQuery({
    queryKey: ["guest", "me", token],
    queryFn: () => getGuestPortalData(token),
    enabled: Boolean(token),
    staleTime: 60_000,
    retry: (failureCount, error) =>
      !isGuestLinkInvalid(error) && failureCount < 2,
  });

  const { data, refetch } = query;

  // Si el acceso o el check-in empiezan pronto, se recarga en ese instante para
  // que el PIN y el reporte de incidencias aparezcan sin tocar nada.
  useEffect(() => {
    if (!data) return;

    const now = Date.now();
    const pending = [data.accessValidFrom, data.checkInAt]
      .map((iso) => new Date(iso).getTime() - now)
      .filter((ms) => ms > 0 && ms < DAY_MS);

    if (pending.length === 0) return;

    const timer = window.setTimeout(
      () => void refetch(),
      Math.min(...pending) + 1_000,
    );

    return () => window.clearTimeout(timer);
  }, [data, refetch]);

  return query;
};
