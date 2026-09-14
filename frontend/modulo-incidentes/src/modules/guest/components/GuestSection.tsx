import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type GuestSectionProps = {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
};

export const GuestSection = ({ icon: Icon, title, children }: GuestSectionProps) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
    </div>
    {children}
  </section>
);

export const GuestCard = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
  >
    {children}
  </div>
);
