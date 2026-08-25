import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { BottomNav } from "@/shared/components/BottomNav";
import { GlobalTaskIndicator } from "@/shared/components/GlobalTaskIndicator";
import { InstallAppBanner } from "@/shared/components/InstallAppBanner";
import { useInstallPrompt } from "@/shared/hooks/useInstallPrompt";
import {
  canExecuteTasks,
  getCurrentRole,
  getHomeRoute,
  hasActiveSession,
} from "@/shared/auth/session";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";

type AppLayoutProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Rutas donde la barra de tarea activa nunca aplica: pantallas de acceso,
 * el formulario de invitado y el área de propietarios.
 */
const isIndicatorBlockedRoute = (pathname: string) =>
  pathname === "/" ||
  pathname === "/login" ||
  pathname === "/seleccionar-rol" ||
  pathname === "/forgot-password" ||
  pathname === "/reset-password" ||
  pathname === "/visitor-form" ||
  pathname.startsWith("/owner");

/**
 * El banner de instalacion tiene su propia lista: los propietarios si son
 * destinatarios validos, y solo estorba en el formulario de invitado, que es
 * un flujo de un solo uso.
 */
const isInstallBlockedRoute = (pathname: string) => pathname === "/visitor-form";

/**
 * Secciones principales que llevan barra inferior. Las pantallas de detalle y
 * los formularios se dejan fuera a propósito: tienen su propio botón de volver
 * y la barra solo competiría con él.
 *
 * Cada perfil tiene su juego de secciones, igual que su juego de pestañas
 * (ver `BottomNav`): el equipo navega entre tareas y cuenta, y el residente
 * entre lo que antes eran los accesos rápidos de su dashboard.
 */
const OWNER_NAV_ROUTES = [
  "/owner/dashboard",
  "/owner/payments",
  "/owner/reservations",
  "/owner/profile",
];

const isBottomNavRoute = (pathname: string, homeRoute: string) => {
  if (homeRoute === "/owner/dashboard") {
    return OWNER_NAV_ROUTES.includes(pathname);
  }

  return (
    pathname === homeRoute ||
    pathname === "/cuenta" ||
    pathname === "/notificaciones"
  );
};

export const AppLayout = ({ children, className = "bg-white" }: AppLayoutProps) => {
  const location = useLocation();
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);

  // La barra es solo para quien ejecuta y completa tareas, y solo con sesión
  // iniciada: es una lista blanca, no una lista negra de supervisores.
  const canSeeIndicator = hasActiveSession() && canExecuteTasks(getCurrentRole());

  const isExecutionRoute =
    activeTask !== null &&
    location.pathname === `/cleaning-tasks/${activeTask.id}/execute`;

  const showIndicator = Boolean(
    canSeeIndicator &&
    !isIndicatorBlockedRoute(location.pathname) &&
    activeTask &&
    isActiveCleaningTaskPhase(activeTask.phase) &&
    !isExecutionRoute
  );

  const { mode, install, dismiss } = useInstallPrompt();
  const showInstall =
    mode !== "hidden" && !isInstallBlockedRoute(location.pathname);

  // Cada barra fija mide 56px (pt-14) y se apilan.
  const bars = (showIndicator ? 1 : 0) + (showInstall ? 1 : 0);
  const topPadding = bars === 2 ? "pt-28" : bars === 1 ? "pt-14" : undefined;

  const showBottomNav =
    hasActiveSession() &&
    isBottomNavRoute(location.pathname, getHomeRoute());

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className={`min-h-screen w-full max-w-md ${className}`}>
        {showIndicator ? <GlobalTaskIndicator /> : null}
        {showInstall ? (
          <InstallAppBanner
            mode={mode}
            offsetTop={showIndicator}
            onInstall={() => void install()}
            onDismiss={dismiss}
          />
        ) : null}
        {/* Igual que el padding superior por barras apiladas, pero abajo: sin
            esto la barra fija tapa el final del contenido. */}
        <div className={`${topPadding ?? ""} ${showBottomNav ? "pb-16" : ""}`}>
          {children}
        </div>
        {showBottomNav ? <BottomNav /> : null}
      </div>
    </div>
  );
};
