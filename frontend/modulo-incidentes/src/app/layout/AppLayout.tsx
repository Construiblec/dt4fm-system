import type { ReactNode } from "react";
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
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const showIndicator = Boolean(activeTask && isActiveCleaningTaskPhase(activeTask.phase));

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className={`min-h-screen w-full max-w-md ${className}`}>
        {showIndicator ? <GlobalTaskIndicator /> : null}
        <div className={showIndicator ? "pt-14" : undefined}>{children}</div>
      </div>
    </div>
  );
};
