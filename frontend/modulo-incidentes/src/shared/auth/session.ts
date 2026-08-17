import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";

/**
 * Roles que ejecutan y completan tareas en campo. Hoy tienen los mismos
 * permisos; se mantienen separados porque a futuro se habilitarán funciones
 * distintas por rol.
 */
export const TASK_EXECUTION_ROLES = ["TPM Equipment", "Supplier"] as const;

const normalizeRole = (role?: string | null) => role?.trim().toLowerCase() ?? "";

/** Solo estos roles pueden marcar tareas como completadas. */
export const canExecuteTasks = (role?: string | null) => {
  const normalized = normalizeRole(role);
  return TASK_EXECUTION_ROLES.some(
    (allowed) => allowed.toLowerCase() === normalized,
  );
};

export const getCurrentRole = () => localStorage.getItem("role");

export const hasActiveSession = () =>
  Boolean(localStorage.getItem("sessionId"));

/** El acceso de invitado usa una sesión prestada; no es un usuario real. */
export const isVisitorSession = () =>
  Boolean(localStorage.getItem("visitorName"));

const SESSION_KEYS = [
  "session",
  "sessionId",
  "employeeId",
  "cleaningEmployeeId",
  "username",
  "userId",
  "role",
  "tenantId",
  "ownerName",
  "visitorName",
  "visitorPhone",
];

/**
 * Cierra la sesión por completo. Incluye el store persistido de la tarea
 * activa: si no se limpia, el siguiente usuario de este navegador ve la barra
 * "Tarea en progreso" con la tarea del usuario anterior.
 */
export const clearSession = () => {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  useCleaningTaskExecutionStore.getState().clearActiveTask();
};
