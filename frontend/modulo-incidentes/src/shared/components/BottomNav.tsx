import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  Home,
  KeyRound,
  ListChecks,
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

/**
 * Supervisor CAV: rol adicional, no un reemplazo del rol principal de la
 * persona (ver comentario en `rolePalette`). Por eso tiene su propia pestaña
 * en vez de vivir detrás del selector de rol — quien lo tenga entra sin pasar
 * primero por su rol de siempre.
 *
 * Solo Autorizaciones está construido; cuando se sumen Disuasión, Acceso
 * remoto y Eventos, "Accesos" pasa a ser la puerta a las cuatro.
 */
const CAV_TABS: Tab[] = [
  {
    label: "Accesos",
    icon: KeyRound,
    route: "",
    // El detalle de una autorización (`/supervisor-cav/autorizaciones/:id`)
    // sigue siendo Accesos.
    section: "/supervisor-cav",
  },
  { label: "Cuenta", icon: User, route: "/cuenta" },
];

/**
 * Asistente de Supervisión de Limpiezas: mientras su inicio sea un esqueleto,
 * "Inicio" es más honesto que "Tareas" — todavía no hay ninguna lista que
 * abrir. Cuando se defina el contenido, esto probablemente pase a TEAM_TABS.
 */
const ASSISTANT_TABS: Tab[] = [
  { label: "Inicio", icon: ListChecks, route: "" },
  { label: "Cuenta", icon: User, route: "/cuenta" },
];

export const BottomNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = useSessionStore((state) => state.role);

  const home = getHomeRoute(role);
  const view = getRoleView(role);
  const isOwnerArea = home === "/owner/dashboard";
  const isCavArea = home.startsWith("/supervisor-cav");
  const isAssistantArea = home === "/asistente-sl";
  const tabs = isOwnerArea
    ? OWNER_TABS
    : isCavArea
      ? CAV_TABS
      : isAssistantArea
        ? ASSISTANT_TABS
        : TEAM_TABS;

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
