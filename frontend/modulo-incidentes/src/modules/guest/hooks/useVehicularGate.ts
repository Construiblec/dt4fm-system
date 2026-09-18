import { useRef } from "react";
import axios from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  commandVehicularGate,
  type GateAction,
} from "../services/guestPortalService";

export const useVehicularGate = (token: string) => {
  const queryClient = useQueryClient();
  const requestIds = useRef<Partial<Record<GateAction, string>>>({});

  return useMutation({
    mutationFn: (action: GateAction) => {
      const requestId = (requestIds.current[action] ??= crypto.randomUUID());
      return commandVehicularGate(token, action, requestId);
    },
    // El portal trae `vehicularGateOpenUntil`: releerlo mantiene el botón de
    // cerrar cuando el aviso del resultado desaparece.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["guest", "me", token] }),
    onSettled: (_data, error, action) => {
      // Sin respuesta no se sabe si la orden llegó: el siguiente toque reusa el
      // id y el backend devuelve lo que pasó en vez de mandar otro pulso.
      if (!error || (axios.isAxiosError(error) && error.response)) {
        delete requestIds.current[action];
      }
    },
  });
};
