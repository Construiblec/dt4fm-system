import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

export const GuestBackHeader = ({ title }: { title: string }) => (
  <div className="flex items-center gap-3">
    <Link
      to="/guest/dashboard"
      aria-label="Volver a mi portal"
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
    >
      <ChevronLeft className="h-5 w-5 text-slate-700" />
    </Link>
    <h1 className="text-lg font-bold text-slate-900 lg:text-xl">{title}</h1>
  </div>
);
