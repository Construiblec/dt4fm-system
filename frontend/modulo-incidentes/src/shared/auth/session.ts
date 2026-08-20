import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";

/**
 * openMAINT devuelve en `role` el **Code** del rol, no su Description. Ojo con
 * esto: el Code de "TPM Equipment" es `MaintOffice`. Códigos existentes en la
 * instancia: Requester, SuperUser, Guest, Supplier, Propietarios, Team,
 * MaintOffice, SupervisorLimpieza, AdminOffice, TPM.
 *
 * Roles que ejecutan y completan tareas en campo. Hoy tienen los mismos
 * permisos; se mantienen separados porque a futuro se habilitarán funciones
 * distintas por rol.
 */
export const TASK_EXECUTION_ROLES = ["MaintOffice", "Supplier"] as const;

const normalizeRole = (role?: string | null) => role?.trim().toLowerCase() ?? "";

/** Solo estos roles pueden marcar tareas como completadas. */
export const canExecuteTasks = (role?: string | null) => {
  const normalized = normalizeRole(role);
  return TASK_EXECUTION_ROLES.some(
    (allowed) => allowed.toLowerCase() === normalized,
  );
};

export const getCurrentRole = () => localStorage.getItem("role");

/** Los proveedores solo manejan mantenimiento; nunca tareas de limpieza. */
export const isSupplier = (role?: string | null) => {
  const resolved = role ?? getCurrentRole();
  return normalizeRole(resolved) === "supplier";
};

/**
 * Roles cuyo inicio es un panel de supervisión, no el de tareas propias. Cada
 * supervisor tiene el suyo: limpieza y mantenimiento no comparten vista.
 */
const SUPERVISOR_HOME_ROUTES: Record<string, string> = {
  SupervisorLimpieza: "/supervisor",
  SupervisorMantenimiento: "/supervisor-mantenimiento",
};

/**
 * Dashboard que le corresponde al rol. Única fuente de verdad para el destino
 * "inicio": la usan el login y los botones de regresar, para que un supervisor
 * no termine en el dashboard de operario.
 */
export const getHomeRoute = (role?: string | null) => {
  const resolved = role ?? getCurrentRole();
  return (resolved && SUPERVISOR_HOME_ROUTES[resolved]) ?? "/dashboard";
};

/**
 * Guarda el employeeId sin dejar rastro cuando no existe: un
 * `setItem(key, null)` escribe la cadena `"null"`, que luego viaja en la
 * cabecera `x-employee-id` y el backend rechaza con un 400 opaco.
 */
export const storeEmployeeId = (employeeId: string | number | null | undefined) => {
  const parsed = Number(employeeId);

  if (Number.isInteger(parsed) && parsed > 0) {
    localStorage.setItem("employeeId", String(parsed));
    return;
  }

  localStorage.removeItem("employeeId");
};

/** El employeeId es obligatorio para reportar novedades. */
export const getEmployeeId = (): number | null => {
  const parsed = Number(localStorage.getItem("employeeId"));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

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
