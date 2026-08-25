import { useNavigate } from "react-router-dom";
import { clearSession } from "@/shared/auth/session";
import { unsubscribeFromPush } from "@/shared/pwa/pushSubscription";

export const useLogout = () => {
  const navigate = useNavigate();

  return async () => {
    // Antes de limpiar la sesión: la baja necesita el sessionId para
    // autenticarse. El endpoint es del dispositivo, no de la persona, así que
    // sin esto el siguiente usuario de este teléfono heredaría los avisos.
    await unsubscribeFromPush();

    clearSession();
    navigate("/login");
  };
};
