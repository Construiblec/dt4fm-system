import { useNavigate } from "react-router-dom";
import { ArrowLeft, BellOff } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { MOCK_NOTIFICATIONS } from "@/modules/notificaciones/constants/mockNotifications";

/**
 * Avisos del usuario.
 *
 * Se alimenta de datos de prueba: falta decidir dónde se persisten. Al
 * conectarla, lo único que cambia es de dónde sale `notifications`.
 */
export const NotificationsPage = () => {
  const navigate = useNavigate();
  const notifications = MOCK_NOTIFICATIONS;

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen">
        <header className="flex items-center gap-3 px-4 pb-3 pt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Volver"
            className="rounded-full p-1 text-slate-700"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <h1 className="flex-1 text-xl font-bold tracking-tight text-slate-900">
            Notificaciones
          </h1>
        </header>

        <section className="px-4 pb-8">
          {notifications.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <BellOff className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">
                No tienes avisos por ahora
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((notification) => {
                const Icon = notification.icon;

                return (
                  <article
                    key={notification.id}
                    className={`flex gap-3 rounded-2xl border border-slate-200 p-3.5 ${
                      notification.unread ? "bg-white" : "bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${notification.soft}`}
                    >
                      <Icon className={`h-5 w-5 ${notification.text}`} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h2 className="flex-1 text-sm font-bold text-slate-900">
                          {notification.title}
                        </h2>
                        <span className="whitespace-nowrap text-[11px] font-medium text-slate-400">
                          {notification.time}
                        </span>
                      </div>

                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        {notification.body}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </AppLayout>
  );
};
