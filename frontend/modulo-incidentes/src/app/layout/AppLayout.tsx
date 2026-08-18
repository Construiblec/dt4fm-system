import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { GlobalTaskIndicator } from "@/shared/components/GlobalTaskIndicator";
import { InstallAppBanner } from "@/shared/components/InstallAppBanner";
import { useInstallPrompt } from "@/shared/hooks/useInstallPrompt";
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

  // Cada barra fija mide 56px (pt-14) y se apilan.
  const bars = (showIndicator ? 1 : 0) + (showInstall ? 1 : 0);
  const topPadding = bars === 2 ? "pt-28" : bars === 1 ? "pt-14" : undefined;

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
        <div className={topPadding}>{children}</div>
      </div>
    </div>
  );
};
