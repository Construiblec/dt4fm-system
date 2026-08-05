import { env } from "@/config/env";

/**
 * URL completa de un adjunto para abrirlo desde el navegador. El token viaja
 * como query param porque un `<a href>` o un `<img src>` no pueden mandar
 * cabeceras.
 */
export const buildAttachmentUrl = (downloadUrl: string): string => {
  const base = env.VITE_API_URL.replace(/\/api\/?$/, "");
  const token = localStorage.getItem("sessionId") ?? "";

  return `${base}${downloadUrl}?token=${encodeURIComponent(token)}`;
};
