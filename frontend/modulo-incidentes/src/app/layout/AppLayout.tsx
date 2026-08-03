import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { GlobalTaskIndicator } from "@/shared/components/GlobalTaskIndicator";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";

type AppLayoutProps = {
  children: ReactNode;
  className?: string;
};

export const AppLayout = ({ children, className = "bg-white" }: AppLayoutProps) => {
  const location = useLocation();
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  
  const role = localStorage.getItem("role");
  const isSupervisor = role === "SuperUser" || role === "Admin" || role === "SupervisorLimpieza";
  const isAuthRoute =
    location.pathname === "/login" ||
    location.pathname === "/" ||
    location.pathname.startsWith("/owner/auth");

  const showIndicator = Boolean(
    !isAuthRoute &&
    !isSupervisor &&
    activeTask &&
    isActiveCleaningTaskPhase(activeTask.phase)
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
