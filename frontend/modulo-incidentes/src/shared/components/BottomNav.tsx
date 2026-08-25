import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  Home,
  User,
  type LucideIcon,
} from "lucide-react";
import { getHomeRoute } from "@/shared/auth/session";
import { getRoleView } from "@/shared/constants/rolePalette";
import { useSessionStore } from "@/store/sessionStore";

export const BOTTOM_NAV_HEIGHT = "h-16";

type Tab = {
  label: string;
  icon: LucideIcon;
  route: string;
  /** Rutas hijas que también dejan la pestaña marcada como activa. */
  section?: string;
};

/**
 * Equipo: solo dos pestañas. Los avisos se alcanzan por la campana de la
 * cabecera y el cambio de rol por el chip, así que como pestañas serían un
 * tercer camino al mismo sitio.
 *
 * `route: ""` significa "el dashboard del rol activo": no es una ruta fija,
 * depende de con qué rol se haya entrado.
 */
const TEAM_TABS: Tab[] = [
  { label: "Tareas", icon: ClipboardList, route: "" },
  { label: "Cuenta", icon: User, route: "/cuenta" },
];

/**
 * Residentes: los que hasta ahora eran los "accesos rápidos" del dashboard.
 * Estaban como un grid dentro de la pantalla; en la barra están siempre a mano
 * sin tener que volver al inicio primero.
 */
const OWNER_TABS: Tab[] = [
  { label: "Inicio", icon: Home, route: "/owner/dashboard" },
  { label: "Pagos", icon: CreditCard, route: "/owner/payments" },
  {
    label: "Reservas",
    icon: CalendarDays,
    route: "/owner/reservations",
    // El detalle de un área (`/owner/reservations/:areaId`) sigue siendo Reservas.
    section: "/owner/reservations",
  },
  { label: "Perfil", icon: User, route: "/owner/profile" },
];

export const BottomNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = useSessionStore((state) => state.role);

  const home = getHomeRoute(role);
  const view = getRoleView(role);
  const isOwnerArea = home === "/owner/dashboard";
  const tabs = isOwnerArea ? OWNER_TABS : TEAM_TABS;

  return (
    <nav className="fixed bottom-0 left-0 z-40 flex w-full justify-center">
      <div className="w-full max-w-md border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-3px_14px_rgba(16,24,40,0.06)]">
        <div className={`flex items-stretch ${BOTTOM_NAV_HEIGHT}`}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const target = tab.route || home;
            const isActive = tab.section
              ? pathname.startsWith(tab.section)
              : pathname === target;

            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => navigate(target)}
                className="flex flex-1 flex-col items-center justify-center gap-1"
              >
                <Icon
                  className={`h-5 w-5 ${isActive ? view.text : "text-slate-400"}`}
                />
                <span
                  className={`text-[10px] font-semibold ${isActive ? view.text : "text-slate-400"}`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
