import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getApiErrorMessage } from "@/modules/supervisor-cav/services/cavApi";
import {
  commandDoor,
  listDoors,
} from "@/modules/supervisor-cav/services/doorsService";
import type {
  DoorAction,
  DoorCommandOutcome,
  DoorsOverview,
} from "@/modules/supervisor-cav/types/Door";

export type DoorActionResult =
  | { outcome: DoorCommandOutcome }
  | { outcome: "error"; message: string };

export type PendingCommand = { deviceId: string; action: DoorAction };

const ERROR_FALLBACK: Record<DoorAction, string> = {
  open: "No se pudo abrir la puerta",
  close: "No se pudo cerrar la puerta",
};

export const useRemoteDoors = () => {
  const [overview, setOverview] = useState<DoorsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [results, setResults] = useState<Record<string, DoorActionResult>>({});
  const requestIds = useRef<Record<string, string>>({});

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      setOverview(await listDoors());
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudieron cargar las puertas"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const command = useCallback(
    async (deviceId: string, action: DoorAction) => {
      const key = `${deviceId}:${action}`;
      const requestId = (requestIds.current[key] ??= crypto.randomUUID());

      setPending({ deviceId, action });
      setResults((prev) => {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });

      try {
        const result = await commandDoor(deviceId, action, requestId);
        delete requestIds.current[key];
        setResults((prev) => ({
          ...prev,
          [deviceId]: { outcome: result.outcome },
        }));
        void load(true);
      } catch (err) {
        // Sin respuesta no se sabe si la orden llegó: el reintento reusa el id
        // y el backend devuelve lo que pasó en vez de mandar otro pulso.
        if (axios.isAxiosError(err) && err.response) {
          delete requestIds.current[key];
        }
        setResults((prev) => ({
          ...prev,
          [deviceId]: {
            outcome: "error",
            message: getApiErrorMessage(err, ERROR_FALLBACK[action]),
          },
        }));
      } finally {
        setPending(null);
      }
    },
    [load],
  );

  return {
    overview,
    loading,
    error,
    pending,
    results,
    command,
    reload: load,
  };
};
