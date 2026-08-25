import { getRoleView, getSelectableRoles } from "@/shared/constants/rolePalette";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import { getSession, useSessionStore } from "@/store/sessionStore";

/**
 * openMAINT devuelve en `role` el **Code** del rol, no su Description. Ojo con
 * esto: el Code de "TPM Equipment" es `MaintOffice`. Los nombres, colores y
 * rutas de cada rol viven en `@/shared/constants/rolePalette`.
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

/**
 * El rol activo. Sigue leyendo de `localStorage` como respaldo porque hay
 * flujos (invitado) que escriben ahí sin pasar por el store.
 */
export const getCurrentRole = () =>
  getSession().role || localStorage.getItem("role");

/** Los proveedores solo manejan mantenimiento; nunca tareas de limpieza. */
export const isSupplier = (role?: string | null) => {
  const resolved = role ?? getCurrentRole();
  return normalizeRole(resolved) === "supplier";
};

/**
 * Dashboard que le corresponde al rol. Única fuente de verdad para el destino
 * "inicio": la usan el login, el selector de rol y los botones de regresar,
 * para que un supervisor no termine en el dashboard de operario.
 */
export const getHomeRoute = (role?: string | null) =>
  getRoleView(role ?? getCurrentRole()).homeRoute;

/**
 * Roles entre los que este usuario puede alternar sin cerrar sesión.
 *
 * Para pintar en React **no uses esto**: lee `availableRoles` del store con
 * `useSessionStore` y pásalo a `getSelectableRoles`. Esta lectura es puntual
 * (`getState()`) y no re-renderiza cuando la lista cambia.
 */
export const getSwitchableRoles = () =>
  getSelectableRoles(getSession().availableRoles);

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
  "availableRoles",
  "roleLabels",
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
  useSessionStore.getState().clear();
  useCleaningTaskExecutionStore.getState().clearActiveTask();
};
