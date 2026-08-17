import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { GlobalTaskIndicator } from "@/shared/components/GlobalTaskIndicator";
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

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className={`min-h-screen w-full max-w-md ${className}`}>
        {showIndicator ? <GlobalTaskIndicator /> : null}
        <div className={showIndicator ? "pt-14" : undefined}>{children}</div>
      </div>
    </div>
  );
};
