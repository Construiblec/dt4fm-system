import axios from "axios";
import { env } from "@/config/env";

const authApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
  headers: {
    "Content-Type": "application/json",
  },
});

type MessageResponse = {
  message: string;
};

/**
 * Solicita el enlace de recuperación. El backend responde siempre lo mismo,
 * exista o no la cuenta, así que la pantalla no debe intentar deducir nada
 * del resultado.
 */
export const requestPasswordReset = async (
  usernameOrEmail: string,
): Promise<MessageResponse> => {
  const { data } = await authApi.post<MessageResponse>(
    "/auth/forgot-password",
    { usernameOrEmail },
  );

  return data;
};

export const resetPassword = async (
  token: string,
  newPassword: string,
): Promise<MessageResponse> => {
  const { data } = await authApi.post<MessageResponse>("/auth/reset-password", {
    token,
    newPassword,
  });

  return data;
};
