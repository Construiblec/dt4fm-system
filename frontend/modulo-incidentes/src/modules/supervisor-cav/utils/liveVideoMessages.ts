/** `retry` pide otra sesión; `refresh` relee el catálogo; `none`, avisar a Sistemas. */
export type LiveVideoFailure = {
  message: string;
  action: "retry" | "refresh" | "none";
};

const UNAVAILABLE: LiveVideoFailure = {
  message: "Video no disponible.",
  action: "retry",
};

const CAPACITY: LiveVideoFailure = {
  message: "Hay demasiadas cámaras abiertas. Cierra otra o inténtalo en unos minutos.",
  action: "retry",
};

/** Códigos del backend al pedir la sesión (`POST /cameras/:id/live-sessions`). */
const BACKEND_FAILURES: Record<string, LiveVideoFailure> = {
  not_found: { message: "La cámara ya no existe.", action: "refresh" },
  gateway_unreachable: { message: "Edificio sin conexión.", action: "retry" },
  live_capacity_reached: CAPACITY,
  live_unavailable: UNAVAILABLE,
  live_disabled: {
    message: "La videovigilancia en vivo está desactivada.",
    action: "none",
  },
  device_ambiguous: {
    message: "La cámara está mal configurada. Avisa a Sistemas.",
    action: "none",
  },
  invalid_request: {
    message: "Error de integración con el video. Avisa a Sistemas.",
    action: "none",
  },
  duplicate_request: UNAVAILABLE,
};

/** Códigos de `live.construiblec.cloud` al negociar (WHEP). */
const WHEP_FAILURES: Record<string, LiveVideoFailure> = {
  unauthorized: {
    message: "La sesión de video caducó. Vuelve a intentarlo.",
    action: "retry",
  },
  camera_unreachable: { message: "Cámara sin señal.", action: "retry" },
  // La sesión o su edificio dejaron de existir entre el ticket y la oferta.
  not_found: {
    message: "La cámara dejó de estar disponible. Vuelve a intentarlo.",
    action: "retry",
  },
  live_capacity_reached: {
    message: "Hay demasiadas cámaras abiertas o esta ya tiene dos espectadores.",
    action: "retry",
  },
  live_unavailable: UNAVAILABLE,
  invalid_request: {
    message: "El navegador no pudo negociar el video. Avisa a Sistemas.",
    action: "none",
  },
  timeout: { message: "La cámara no respondió a tiempo.", action: "retry" },
  network: {
    message: "No se pudo conectar con el servidor de video.",
    action: "retry",
  },
};

export const backendFailure = (
  code: string | undefined,
  status: number | undefined,
): LiveVideoFailure => {
  if (code && BACKEND_FAILURES[code]) return BACKEND_FAILURES[code];
  if (status === 403) {
    return { message: "No tienes permiso para ver las cámaras.", action: "none" };
  }

  return UNAVAILABLE;
};

/** El `403` de WHEP es el origen de la página, no el ticket: no se arregla reintentando. */
export const whepFailure = (status: number, code: string): LiveVideoFailure => {
  if (status === 403) {
    return {
      message: "Este sitio no está autorizado para ver video. Avisa a Sistemas.",
      action: "none",
    };
  }

  return WHEP_FAILURES[code] ?? UNAVAILABLE;
};
