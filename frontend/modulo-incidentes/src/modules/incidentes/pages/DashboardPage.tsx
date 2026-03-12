import { AppLayout } from "@/app/layout/AppLayout";
import logo from "@/shared/assets/images/construiblec-logo.png";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { BottomNavigation } from "@/modules/incidentes/components/BottomNavigation";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { TaskCard } from "@/modules/incidentes/components/TaskCard";

const tasks = [
  {
    id: "R103",
    priority: "ALTA" as const,
    time: "9:00 AM - 45m",
    description: "Habitaci\u00f3n sin utensilios",
    status: "Finalizada",
  },
  {
    id: "I203",
    priority: "MEDIA" as const,
    time: "9:00 AM - 45m",
    description: "Llevar escobas",
    status: "Iniciar",
  },
  {
    id: "B203",
    priority: "BAJA" as const,
    time: "9:00 AM - 45m",
    description: "Retirar escobas en recepci\u00f3n",
    status: "En Pausa",
  },
];

export const DashboardPage = () => {
  const logout = useLogout();

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

            <div className="space-y-4">
              {tasks.map((task) => (
                <TaskCard key={task.id} {...task} />
              ))}
            </div>
          </div>
        </section>

        <FloatingReportButton />
        <BottomNavigation />
      </main>
    </AppLayout>
  );
};
