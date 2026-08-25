import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getHomeRoute } from "@/shared/auth/session";
import { switchRole as requestRoleSwitch, type LoginResponse } from "@/services/api";
import { useSessionStore, type Session } from "@/store/sessionStore";

const toNumber = (value: string | number | null | undefined): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** Traduce la respuesta del backend a la sesión que guarda el cliente. */
export const toSession = (response: LoginResponse): Session => ({
  sessionId: response.sessionId,
  username: response.username,
  userId: toNumber(response.userId),
  role: response.role,
  availableRoles: response.availableRoles ?? [],
  roleLabels: response.roleLabels ?? {},
  name: response.name ?? null,
  employeeId: toNumber(response.employeeId),
  cleaningEmployeeId: toNumber(response.cleaningEmployeeId),
  tenantId: toNumber(response.tenantId),
});

/**
 * Cambia el rol activo y lleva al dashboard del rol nuevo.
 *
 * El cambio lo hace openMAINT sobre la sesión viva, así que hay que reemplazar
 * la sesión entera con lo que responda: los identificadores no son los mismos
 * en todos los grupos (el mismo usuario puede ser empleado en uno y residente
 * en otro), y quedarse con los antiguos dejaría al dashboard pidiendo datos con
 * el id equivocado.
 */
export const useRoleSwitch = () => {
  const navigate = useNavigate();
  const sessionId = useSessionStore((state) => state.sessionId);
  const setSession = useSessionStore((state) => state.setSession);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeRole = async (role: string) => {
    setError(null);
    setPendingRole(role);

    try {
      const response = await requestRoleSwitch(sessionId, role);
      setSession(toSession(response));
      navigate(getHomeRoute(response.role));
      return true;
    } catch {
      setError("No se pudo cambiar de rol. Inténtalo de nuevo.");
      return false;
    } finally {
      setPendingRole(null);
    }
  };

  return { changeRole, pendingRole, error };
};
