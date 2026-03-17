import { AppLayout } from "@/app/layout/AppLayout";
import { useEffect, useState } from "react";
import logo from "@/shared/assets/images/construiblec-logo.png";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { BottomNavigation } from "@/modules/incidentes/components/BottomNavigation";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { TaskCard } from "@/modules/incidentes/components/TaskCard";
import { getMyIncidents } from "@/modules/incidentes/services/incidentsService";
import type { Incident } from "@/modules/incidentes/types/Incident";

export const DashboardPage = () => {
  const logout = useLogout();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getMyIncidents();
        setIncidents(data);
      } catch {
        setError("No se pudieron cargar los incidentes");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen flex flex-col bg-gray-100">
        <header className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Construiblec"
              className="h-12 w-12 rounded-xl bg-white p-1 shadow-sm"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Construiblec
              </p>
              <h1 className="text-lg font-bold text-slate-900">Dashboard</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Salir
          </button>
        </header>

        <section className="flex-1 px-4 pb-32">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">Mis tareas</h2>
            </div>

            {loading ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                Cargando incidentes...
              </div>
            ) : null}

            {!loading && error ? (
              <div className="rounded-xl bg-white p-4 text-sm text-red-600 shadow-sm">
                Error al cargar incidentes
              </div>
            ) : null}

            {!loading && !error && incidents.length === 0 ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                No tienes incidentes asignados
              </div>
            ) : null}

            {!loading && !error && incidents.length > 0 ? (
              <div className="space-y-4">
                {incidents.map((incident) => (
                  <TaskCard key={incident.id} {...incident} />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <FloatingReportButton />
        <BottomNavigation />
      </main>
    </AppLayout>
  );
};
