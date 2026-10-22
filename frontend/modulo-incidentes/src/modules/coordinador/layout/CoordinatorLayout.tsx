import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  CalendarDays,
  Inbox,
  ListChecks,
  ChevronsUpDown,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { RoleSwitchSheet } from "@/shared/components/RoleSwitchSheet";
import {
  getRoleLabel,
  getRoleView,
  getSelectableRoles,
} from "@/shared/constants/rolePalette";
import { useSessionStore } from "@/store/sessionStore";
import { useCoordFlash } from "./flash";
import { Button, InlineAlert, FOCUS } from "../components/ui";
import { cx } from "../components/uiUtils";
import { TaskPanel } from "../pages/TaskPanel";
import { usePendingCount } from "../hooks/useCoordData";

/**
 * Armazón de escritorio de la coordinación: menú lateral, barra superior y el
 * contenido. El resto de la app vive en una columna de móvil (`max-w-md`); la
 * coordinación trabaja con tablas y una agenda, así que usa todo el ancho.
 */

const NAV = [
  {
    to: "/coordinador/pendientes",
    label: "Pendientes",
    icon: Inbox,
    match: ["/coordinador/pendientes"],
    counter: true,
  },
  {
    to: "/coordinador/limpiezas",
    label: "Limpiezas",
    icon: CalendarDays,
    match: ["/coordinador/limpiezas", "/coordinador/agenda"],
  },
  {
    to: "/coordinador/sincronizacion",
    label: "Sincronización",
    icon: RefreshCw,
    match: ["/coordinador/sincronizacion"],
  },
  {
    to: "/coordinador/checklists",
    label: "Checklists",
    icon: ListChecks,
    match: ["/coordinador/checklists"],
  },
  {
    to: "/coordinador/perfil",
    label: "Mi perfil",
    icon: UserRound,
    match: ["/coordinador/perfil"],
  },
] as const;

const initials = (name: string) =>
  name
    .split(/[.\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pending = usePendingCount();
  const logout = useLogout();
  const username = useSessionStore((s) => s.username);
  const name = useSessionStore((s) => s.name);
  const availableRoles = useSessionStore((s) => s.availableRoles);
  const canSwitch = getSelectableRoles(availableRoles).length > 1;
  const display = name || username;
  const role = useSessionStore((s) => s.role);
  const roleLabels = useSessionStore((s) => s.roleLabels);
  const view = getRoleView(role);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <CalendarCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Construiblec
          </p>
          <p className="text-sm font-semibold leading-tight text-slate-900">
            Coordinación de limpiezas
          </p>
        </div>
      </div>

      <div className="px-5">
        {canSwitch ? (
          <button
            type="button"
            onClick={() => setRoleSheetOpen(true)}
            className={cx(
              "inline-flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3",
              view.soft,
              FOCUS,
            )}
          >
            <span className={cx("h-2 w-2 rounded-full", view.dot)} />
            <span className={cx("text-xs font-bold", view.text)}>
              {getRoleLabel(role, roleLabels)}
            </span>
            <ChevronsUpDown
              className={cx("h-4 w-4", view.text)}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span
            className={cx(
              "inline-flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3",
              view.soft,
            )}
          >
            <span className={cx("h-2 w-2 rounded-full", view.dot)} />
            <span className={cx("text-xs font-bold", view.text)}>
              {getRoleLabel(role, roleLabels)}
            </span>
          </span>
        )}
      </div>

      <div className="px-4 pt-4">
        <Button
          variant="primary"
          icon={Plus}
          className="w-full"
          onClick={() => {
            navigate("/coordinador/nueva");
            onNavigate?.();
          }}
        >
          Nueva limpieza
        </Button>
      </div>

      <nav
        className="mt-4 flex-1 space-y-1 overflow-y-auto px-3"
        aria-label="Secciones"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.match.some((m) =>
            "end" in item && item.end ? pathname === m : pathname.startsWith(m),
          );

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition",
                FOCUS,
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon
                className={cx(
                  "h-5 w-5",
                  active ? "text-indigo-600" : "text-slate-400",
                )}
                aria-hidden="true"
              />
              <span className="flex-1 text-left">{item.label}</span>
              {"counter" in item && item.counter && pending ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-800">
                  {pending}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-5 py-4">
        <NavLink
          to="/coordinador/perfil"
          onClick={onNavigate}
          aria-label="Mi perfil"
          className={cx(
            "-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-slate-100",
            FOCUS,
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {initials(display || "?")}
          </span>
          <div className="min-w-0 text-xs">
            <p className="truncate font-semibold text-slate-800">{display}</p>
            <p className="truncate font-mono text-slate-500">{username}</p>
          </div>
        </NavLink>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={LogOut}
            onClick={() => void logout()}
          >
            Cerrar sesión
          </Button>
        </div>
      </div>
      <RoleSwitchSheet
        open={roleSheetOpen}
        onClose={() => setRoleSheetOpen(false)}
      />
    </div>
  );
};

const FlashBar = () => {
  const flash = useCoordFlash((s) => s.flash);
  const clear = useCoordFlash((s) => s.clear);
  if (!flash) return null;

  return (
    <div className="mb-6">
      <InlineAlert
        tone={flash.tone}
        action={
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={clear}
            className={cx("rounded-md p-1 opacity-70 hover:opacity-100", FOCUS)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        }
      >
        {flash.text}
      </InlineAlert>
    </div>
  );
};

export const CoordinatorLayout = () => {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const clearFlash = useCoordFlash((s) => s.clear);

  // Un aviso sobrevive al cambio de sección ("Limpieza creada" se lee ya en la
  // lista), pero no queda colgado al salir de la coordinación.
  useEffect(() => {
    return () => clearFlash();
  }, [clearFlash]);

  // El menú de móvil también se cierra con Esc.
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-gray-100 text-slate-900">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow"
      >
        Ir al contenido
      </a>

      <div className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 lg:block">
        <Sidebar />
      </div>

      {navOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
        >
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setNavOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[85vw] shadow-2xl">
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-gray-100/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setNavOpen(true)}
              className={cx(
                "rounded-lg p-2 text-slate-600 hover:bg-white lg:hidden",
                FOCUS,
              )}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <p className="truncate text-sm font-semibold text-slate-900 lg:hidden">
              Coordinación de limpiezas
            </p>
          </div>
        </header>

        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-6 outline-none sm:px-6 lg:px-8"
        >
          <FlashBar />
          {/* La clave fuerza un montaje limpio al cambiar de sección. */}
          <Outlet key={pathname} />
        </main>
      </div>

      <TaskPanel />
      <FloatingReportButton corner />
    </div>
  );
};
