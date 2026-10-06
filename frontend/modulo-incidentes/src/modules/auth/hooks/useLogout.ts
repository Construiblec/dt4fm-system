import { useNavigate } from "react-router-dom";
import { logout } from "@/services/api";
import { clearSession } from "@/shared/auth/session";
import { unsubscribeFromPush } from "@/shared/pwa/pushSubscription";

export const useLogout = () => {
  const navigate = useNavigate();

  return async () => {
    // Antes de limpiar la sesión: la baja necesita el sessionId para
    // autenticarse. El endpoint es del dispositivo, no de la persona, así que
    // sin esto el siguiente usuario de este teléfono heredaría los avisos.
    await unsubscribeFromPush();

    // También antes de limpiar, por lo mismo. Sin red el móvil la olvida
    // igual; en el servidor deja de mantenerse viva cuando se cumplen sus 30
    // días sin uso.
    await logout().catch(() => undefined);

    clearSession();
    navigate("/login");
  };
};
