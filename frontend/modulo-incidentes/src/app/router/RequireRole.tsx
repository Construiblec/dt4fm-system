import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getHomeRoute, hasActiveSession } from "@/shared/auth/session";
import { rememberReturnTo } from "@/shared/auth/returnTo";
import { useSessionStore } from "@/store/sessionStore";

type Props = {
  /**
   * Grupos de openMAINT que pueden ver esta pantalla. Se comparan contra
   * `availableRoles`, no contra el rol activo: alguien que tiene el rol pero
   * está operando con otro no debería toparse con un rebote, solo con una
   * pantalla que no le toca ahora.
   */
  roles: string[];
  children: ReactNode;
};

/**
 * Guarda de ruta por rol.
 *
 * Hasta ahora el router no tenía ninguna: cualquier pantalla —incluidas las de
 * supervisor— se alcanzaba escribiendo la URL. Esto lo cierra.
 *
 * **Es defensa en el cliente, no la barrera real.** Quien mande puede saltarse
 * esto tocando `localStorage`. Lo que de verdad protege son los permisos de
 * grupo de openMAINT: sin ellos las consultas no devuelven datos aunque se
 * llegue a pintar la pantalla. Esto evita el acceso accidental y que alguien
 * aterrice en una vista que su cuenta no puede alimentar.
 */
export const RequireRole = ({ roles, children }: Props) => {
  const { pathname, search } = useLocation();
  const availableRoles = useSessionStore((state) => state.availableRoles);
  const role = useSessionStore((state) => state.role);

  // Sin sesión: al login, recordando a dónde iba para volver tras entrar.
  if (!hasActiveSession()) {
    rememberReturnTo(`${pathname}${search}`);
    return <Navigate to="/login" replace />;
  }

  // `availableRoles` puede llegar vacío en sesiones creadas antes de que se
  // guardara la lista. Rebotar ahí dejaría fuera a usuarios legítimos, así que
  // se deja pasar y openMAINT decide.
  if (availableRoles.length === 0) {
    return <>{children}</>;
  }

  if (!roles.some((allowed) => availableRoles.includes(allowed))) {
    return <Navigate to={getHomeRoute(role)} replace />;
  }

  return <>{children}</>;
};
