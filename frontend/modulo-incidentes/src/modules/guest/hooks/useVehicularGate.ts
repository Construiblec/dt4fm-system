import { useRef, useState } from "react";
import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  commandVehicularGate,
  type GateAction,
} from "../services/guestPortalService";

export const useVehicularGate = (token: string) => {
  const queryClient = useQueryClient();
  const requestIds = useRef<Partial<Record<GateAction, string>>>({});
  // Sobrevive al `reset` del aviso: el botón sigue deshabilitado hasta que venza.
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const refreshPortal = () =>
    queryClient.invalidateQueries({ queryKey: ["guest", "me", token] });

  const mutation = useMutation({
    mutationFn: (action: GateAction) => {
      const requestId = (requestIds.current[action] ??= crypto.randomUUID());
      return commandVehicularGate(token, action, requestId);
    },
    // El portal trae `vehicularGateOpenUntil`: releerlo mantiene el botón de
    // cerrar cuando el aviso del resultado desaparece.
    onSuccess: (data) => {
      if (data.cooldownUntil) setCooldownUntil(data.cooldownUntil);
      return refreshPortal();
    },
    onError: (error) => {
      if (!axios.isAxiosError(error) || !error.response) return;

      // Otro pulsó antes: el `429` dice cuánto falta y el portal trae la fase nueva.
      const retryAfter = (error.response.data as { retryAfterSeconds?: unknown })
        ?.retryAfterSeconds;
      if (error.response.status === 429 && typeof retryAfter === "number") {
        setCooldownUntil(new Date(Date.now() + retryAfter * 1000).toISOString());
      }
      void refreshPortal();
    },
    onSettled: (_data, error, action) => {
      // Sin respuesta no se sabe si la orden llegó: el siguiente toque reusa el
      // id y el backend devuelve lo que pasó en vez de mandar otro pulso.
      if (!error || (axios.isAxiosError(error) && error.response)) {
        delete requestIds.current[action];
      }
    },
  });

  return { ...mutation, cooldownUntil };
};
