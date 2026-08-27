import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BellOff, CheckCheck, Loader2 } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { getNotificationStyle } from "@/modules/notificaciones/constants/notificationStyles";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/notificaciones/services/notificationsService";
import type { AppNotification } from "@/modules/notificaciones/types/AppNotification";
import { formatRelativeTime } from "@/shared/utils/dateUtils";
import { useNotificationsStore } from "@/store/notificationsStore";

/** Avisos del usuario, con el historial que guarda el backend al notificar. */
export const NotificationsPage = () => {
  const navigate = useNavigate();
  const setUnread = useNotificationsStore((state) => state.setUnread);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getNotifications();
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      setError("No se pudieron cargar las notificaciones");
    } finally {
      setIsLoading(false);
    }
  }, [setUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasUnread = notifications.some((notification) => !notification.read);

  /**
   * Marcar leída es optimista: el aviso se apaga al instante y el contador
   * llega del backend. Si falla, se deja como estaba en vez de mentir.
   */
  const handleOpen = async (notification: AppNotification) => {
    if (!notification.read) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item,
        ),
      );

      try {
        setUnread(await markNotificationRead(notification.id));
      } catch {
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, read: false } : item,
          ),
        );
      }
    }

    if (notification.deepLink) {
      navigate(notification.deepLink);
    }
  };

  const handleMarkAll = async () => {
    const previous = notifications;
    setNotifications((current) =>
      current.map((item) => ({ ...item, read: true })),
    );

    try {
      setUnread(await markAllNotificationsRead());
    } catch {
      setNotifications(previous);
    }
  };

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

          {hasUnread ? (
            <button
              type="button"
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </button>
          ) : null}
        </header>

        <section className="px-4 pb-8">
          {isLoading ? (
            <div className="mt-16 flex justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <p className="text-sm font-medium text-slate-500">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm"
              >
                Reintentar
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <BellOff className="h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">
                No tienes avisos por ahora
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((notification) => {
                const style = getNotificationStyle(notification.type);
                const Icon = style.icon;

                return (
                  <article
                    key={notification.id}
                    className={`rounded-2xl border border-slate-200 ${
                      notification.read ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void handleOpen(notification)}
                      className="flex w-full gap-3 p-3.5 text-left"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.soft}`}
                      >
                        <Icon className={`h-5 w-5 ${style.text}`} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <h2 className="flex-1 text-sm font-bold text-slate-900">
                            {notification.title}
                          </h2>
                          <span className="whitespace-nowrap text-[11px] font-medium text-slate-400">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </div>

                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          {notification.body}
                        </p>
                      </div>
                    </button>
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