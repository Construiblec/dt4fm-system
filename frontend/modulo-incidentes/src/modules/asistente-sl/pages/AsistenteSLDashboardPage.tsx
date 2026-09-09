import { Construction } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { AppHeader } from "@/shared/components/AppHeader";
import { getRoleView } from "@/shared/constants/rolePalette";

/**
 * Inicio del rol `AsistenteSL` (Asistente de Supervisión de Limpiezas).
 *
 * Es deliberadamente un esqueleto: da acceso a lo transversal —avisos, cambio
 * de rol, cuenta, reportar novedad— mientras se define qué contenido le toca.
 * El cuerpo se sustituye cuando se decida; el resto de la pantalla ya no habrá
 * que tocarlo.
 *
 * Lo que este rol **no** puede hacer, por si tienta añadirlo aquí: en openMAINT
 * no tiene ningún permiso sobre `PreventiveMaint`, así que un listado de
 * preventivos devolvería 403. Sí tiene escritura sobre `CleaningTask` y
 * `CorrectiveMaint`.
 */
export const AsistenteSLDashboardPage = () => {
  const view = getRoleView("AsistenteSL");

  return (
    <AppLayout className="bg-gray-100">
      <main className="flex min-h-screen flex-col bg-gray-100">
        <AppHeader />

        {/* La barra inferior es fija; el contenido deja aire debajo. */}
        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <h1 className="text-center text-2xl font-bold text-slate-900">
              {view.name}
            </h1>

            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full ${view.soft}`}
              >
                <Construction className={`h-6 w-6 ${view.text}`} />
              </div>

              <p className="text-sm font-semibold text-slate-900">
                Sección en construcción
              </p>
              <p className="text-sm text-slate-500">
                Mientras tanto puedes reportar novedades, revisar tus avisos y
                gestionar tu cuenta desde la barra inferior.
              </p>
            </div>
          </div>
        </section>

        <FloatingReportButton />
      </main>
    </AppLayout>
  );
};
