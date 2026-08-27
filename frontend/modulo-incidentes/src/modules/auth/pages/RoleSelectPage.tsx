import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, Circle, LogOut } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { useRoleSwitch } from "@/modules/auth/hooks/useRoleSwitch";
import { getHomeRoute, hasActiveSession } from "@/shared/auth/session";
import { consumeReturnTo } from "@/shared/auth/returnTo";
import { getRoleLabel, getSelectableRoles } from "@/shared/constants/rolePalette";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { useSessionStore } from "@/store/sessionStore";

/** Iniciales para el avatar, a partir del nombre o del usuario. */
const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Paso posterior al login, solo cuando la cuenta abre más de una vista.
 *
 * Elegir aquí no vuelve a autenticar: la sesión ya está emitida y el rol se
 * aplica cambiando el grupo activo de esa misma sesión.
 */
export const RoleSelectPage = () => {
  const navigate = useNavigate();
  const logout = useLogout();
  const session = useSessionStore();
  const { changeRole, pendingRole, error } = useRoleSwitch();

  const roles = getSelectableRoles(session.availableRoles);
  const [selected, setSelected] = useState(
    () => roles.find((role) => role.code === session.role)?.code ?? roles[0]?.code,
  );

  // Sin sesión no hay nada que elegir; y si la cuenta resultó tener una sola
  // vista, esta pantalla no debe llegar a verse.
  useEffect(() => {
    if (!hasActiveSession()) {
      navigate("/login", { replace: true });
      return;
    }

    if (roles.length <= 1) {
      navigate(getHomeRoute(session.role), { replace: true });
    }
  }, [navigate, roles.length, session.role]);

  const active = roles.find((role) => role.code === selected);
  // Desde el `username` (`nombre.apellido`): `name` es el `userDescription` de
  // openMAINT, que en las cuentas del equipo lleva el cargo, no el nombre.
  const displayName = formatEmployeeName(session.username);

  const enter = async () => {
    if (!active) {
      return;
    }

    // Destino pendiente tras un 401: el login lo dejó sin consumir para que se
    // restaure una vez elegido el rol, que es lo que decide los permisos.
    const pending = consumeReturnTo(session.username);

    // El login ya emitió la sesión en el grupo por defecto: si el elegido es
    // ese, no hay nada que pedirle a openMAINT. Si es otro, hay que cambiarlo
    // de verdad allí, porque los permisos van atados al grupo de la sesión.
    if (active.code === session.role) {
      navigate(pending ?? active.homeRoute, { replace: true });
      return;
    }

    await changeRole(active.code, pending);
  };

  return (
    <AppLayout className="bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <section className="w-full max-w-sm rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${active?.solid ?? "bg-brand"}`}
            >
              {initials(displayName)}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-slate-900">
                {displayName}
              </p>
              <p className="text-xs font-medium text-slate-500">
                Sesión iniciada
              </p>
            </div>

            <button
              type="button"
              onClick={logout}
              aria-label="Cerrar sesión"
              className="shrink-0 rounded-full p-2 text-slate-400 transition hover:text-slate-600"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>

          <div className="my-5 h-px bg-slate-100" />

          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            ¿Con qué rol quieres entrar?
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Tu cuenta tiene {roles.length} roles asignados. Cada uno abre una
            vista distinta y puedes cambiarlo después sin volver a iniciar
            sesión.
          </p>

          <div className="mt-5 space-y-2.5">
            {roles.map((role) => {
              const Icon = role.icon;
              const isActive = role.code === selected;

              return (
                <button
                  key={role.code}
                  type="button"
                  onClick={() => setSelected(role.code)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] p-3.5 text-left transition ${
                    isActive
                      ? `${role.ring} ${role.soft}`
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${role.soft}`}
                  >
                    <Icon className={`h-5 w-5 ${role.text}`} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">
                      {getRoleLabel(role.code, session.roleLabels)}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-400">
                      {role.desc}
                    </span>
                  </span>

                  {isActive ? (
                    <CircleCheck className={`h-5 w-5 shrink-0 ${role.text}`} />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                  )}
                </button>
              );
            })}
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void enter()}
            disabled={!active || pendingRole !== null}
            className={`mt-5 w-full rounded-xl py-4 text-base font-semibold text-white transition disabled:opacity-60 ${active?.solid ?? "bg-brand"}`}
          >
            {pendingRole
              ? "Entrando..."
              : `Entrar como ${getRoleLabel(active?.code, session.roleLabels) || "…"}`}
          </button>
        </section>
      </main>
    </AppLayout>
  );
};
