import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReportedIncidents,
  type ReportedIncident,
} from "@/modules/incidentes/services/incidentsService";
import { getEmployeeId } from "@/shared/auth/session";

export const REPORTED_INCIDENTS_KEY = ["reported-incidents"] as const;

export const useReportedIncidents = (enabled = true) =>
  useQuery({
    queryKey: REPORTED_INCIDENTS_KEY,
    queryFn: getReportedIncidents,
    staleTime: 60_000,
    enabled: enabled && getEmployeeId() !== null,
  });

export const useInvalidateReportedIncidents = () => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: REPORTED_INCIDENTS_KEY });
};

type SeenMap = Record<string, string>;

const seenKey = () => `reportedSeen:${getEmployeeId() ?? "anon"}`;

const readSeen = (): SeenMap => {
  try {
    return JSON.parse(localStorage.getItem(seenKey()) ?? "{}") as SeenMap;
  } catch {
    return {};
  }
};

const writeSeen = (seen: SeenMap) => {
  try {
    localStorage.setItem(seenKey(), JSON.stringify(seen));
  } catch {
    // Sin almacenamiento simplemente no hay contador.
  }
};

/**
 * Reportes cuyo estado cambió desde la última vez que se abrió la hoja. Un
 * reporte que aún no se había visto cuenta como visto: no es un cambio.
 */
export const useUnseenReportChanges = (
  reports: ReportedIncident[] | undefined,
) => {
  const [seen, setSeen] = useState(readSeen);

  const unseen = useMemo(
    () =>
      (reports ?? []).filter((report) => {
        const previous = seen[report.id];
        return previous !== undefined && previous !== (report.statusCode ?? "");
      }).length,
    [reports, seen],
  );

  const markSeen = useCallback(() => {
    if (!reports) return;
    const next = { ...readSeen() };
    reports.forEach((report) => {
      next[report.id] = report.statusCode ?? "";
    });
    writeSeen(next);
    setSeen(next);
  }, [reports]);

  // Los nuevos se registran sin contar como cambio.
  useEffect(() => {
    if (!reports?.some((report) => seen[report.id] === undefined)) return;
    const next = { ...seen };
    reports.forEach((report) => {
      next[report.id] ??= report.statusCode ?? "";
    });
    writeSeen(next);
    setSeen(next);
  }, [reports, seen]);

  return { unseen, markSeen };
};
