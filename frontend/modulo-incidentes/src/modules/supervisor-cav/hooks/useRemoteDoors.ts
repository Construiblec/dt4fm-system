import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getApiErrorMessage } from "@/modules/supervisor-cav/services/cavApi";
import {
  commandDoor,
  listDoors,
  resolveDoor,
} from "@/modules/supervisor-cav/services/doorsService";
import type {
  DoorAction,
  DoorCommandOutcome,
  DoorsOverview,
} from "@/modules/supervisor-cav/types/Door";

export type DoorActionResult =
  | { outcome: DoorCommandOutcome; action: DoorAction; errorCode?: string }
  | { outcome: "resolved" }
  | { outcome: "error"; message: string };

export type PendingCommand = {
  deviceId: string;
  action: DoorAction | "resolve";
};

const ERROR_FALLBACK = "No se pudo enviar la orden a la barrera";

export const useRemoteDoors = () => {
  const [overview, setOverview] = useState<DoorsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [results, setResults] = useState<Record<string, DoorActionResult>>({});
  // Fin del enfriamiento por barrera, hasta que la lista releída lo traiga.
  const [cooldowns, setCooldowns] = useState<Record<string, string>>({});
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
          [deviceId]: {
            outcome: result.outcome,
            action,
            errorCode: result.errorCode,
          },
        }));
        if (result.cooldownUntil) {
          const until = result.cooldownUntil;
          setCooldowns((prev) => ({ ...prev, [deviceId]: until }));
        }
        void load(true);
      } catch (err) {
        // Sin respuesta no se sabe si la orden llegó: el reintento reusa el id
        // y el backend devuelve lo que pasó en vez de mandar otro pulso.
        if (axios.isAxiosError(err) && err.response) {
          delete requestIds.current[key];

          // Otro pulsó antes: el `429` dice cuánto falta y la lista trae la fase nueva.
          const retryAfter = (err.response.data as { retryAfterSeconds?: unknown })
            ?.retryAfterSeconds;
          if (err.response.status === 429 && typeof retryAfter === "number") {
            const until = new Date(Date.now() + retryAfter * 1000).toISOString();
            setCooldowns((prev) => ({ ...prev, [deviceId]: until }));
          }
          void load(true);
        }
        setResults((prev) => ({
          ...prev,
          [deviceId]: {
            outcome: "error",
            message: getApiErrorMessage(err, ERROR_FALLBACK),
          },
        }));
      } finally {
        setPending(null);
      }
    },
    [load],
  );

  const resolve = useCallback(
    async (deviceId: string) => {
      setPending({ deviceId, action: "resolve" });

      try {
        await resolveDoor(deviceId);
        setResults((prev) => ({ ...prev, [deviceId]: { outcome: "resolved" } }));
        void load(true);
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [deviceId]: {
            outcome: "error",
            message: getApiErrorMessage(err, "No se pudo liberar la barrera"),
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
    cooldowns,
    command,
    resolve,
    reload: load,
  };
};
