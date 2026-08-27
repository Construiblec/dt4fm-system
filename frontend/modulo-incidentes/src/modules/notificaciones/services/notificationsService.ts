import axios from "axios";
import { env } from "@/config/env";
import type { AppNotification } from "@/modules/notificaciones/types/AppNotification";

const notificationsApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
  headers: {
    "Content-Type": "application/json",
  },
});

/** El backend resuelve la identidad desde la sesión; no se manda userId. */
const authHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
});

type NotificationsResponse = {
  notifications: AppNotification[];
  unread: number;
};

type UnreadResponse = { unread: number };

export const getNotifications = async (
  before?: string,
): Promise<NotificationsResponse> => {
  const { data } = await notificationsApi.get<NotificationsResponse>(
    "/push/notifications",
    { headers: authHeaders(), params: before ? { before } : undefined },
  );

  return data;
};

export const getUnreadCount = async (): Promise<number> => {
  const { data } = await notificationsApi.get<UnreadResponse>(
    "/push/notifications/unread-count",
    { headers: authHeaders() },
  );

  return data.unread;
};

export const markNotificationRead = async (id: string): Promise<number> => {
  const { data } = await notificationsApi.post<UnreadResponse>(
    `/push/notifications/${id}/read`,
    {},
    { headers: authHeaders() },
  );

  return data.unread;
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const { data } = await notificationsApi.post<UnreadResponse>(
    "/push/notifications/read-all",
    {},
    { headers: authHeaders() },
  );

  return data.unread;
};