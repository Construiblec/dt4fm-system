import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { GlobalTaskIndicator } from "@/shared/components/GlobalTaskIndicator";
import { EnableNotificationsBanner } from "@/shared/components/EnableNotificationsBanner";
import { InstallAppBanner } from "@/shared/components/InstallAppBanner";
import { useInstallPrompt } from "@/shared/hooks/useInstallPrompt";
import { useNotificationPrompt } from "@/shared/hooks/useNotificationPrompt";
import {
  canExecuteTasks,
  getCurrentRole,
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

  // Instalar va primero: en iOS el push no llega hasta que la app está en la
  // pantalla de inicio, así que pedir el permiso antes no serviría de nada. Un
  // error de activación sí se muestra siempre: es una avería que hay que ver.
  const notifications = useNotificationPrompt();
  const showNotifications =
    notifications.mode !== "hidden" &&
    (notifications.mode === "error" || !showInstall) &&
    !isInstallBlockedRoute(location.pathname);

  // Cada barra fija mide 56px (pt-14) y se apilan.
  const barsAbove = (showIndicator ? 1 : 0) + (showInstall ? 1 : 0);
  const bars = barsAbove + (showNotifications ? 1 : 0);
  const topPadding =
    bars >= 3 ? "pt-[10.5rem]" : bars === 2 ? "pt-28" : bars === 1 ? "pt-14" : undefined;

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
        {showNotifications ? (
          <EnableNotificationsBanner
            mode={notifications.mode}
            error={notifications.error}
            stackIndex={barsAbove}
            onEnable={() => void notifications.enable()}
            onDismiss={notifications.dismiss}
          />
        ) : null}
        <div className={topPadding}>{children}</div>
      </div>
    </div>
  );
};
