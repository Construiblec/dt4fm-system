import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";

export const OwnerReservationsPage = () => {
  const navigate = useNavigate();
  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <button
          type="button"
          onClick={() => navigate("/owner/dashboard")}
          className="mb-6 flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver al inicio
        </button>
        <h1 className="mb-4 text-xl font-bold text-slate-900">Reservas</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-400">Próximamente disponible.</p>
        </div>
      </main>
    </AppLayout>
  );
};
