import type { ReactNode } from "react";

type AppLayoutProps = {
  children: ReactNode;
  className?: string;
};

export const AppLayout = ({ children, className = "bg-white" }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      <div className={`min-h-screen w-full max-w-md ${className}`}>{children}</div>
    </div>
  );
};
