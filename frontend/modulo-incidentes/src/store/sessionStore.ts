import { create } from "zustand";

/**
 * Sesión del usuario, reactiva.
 *
 * Existe porque el rol dejó de ser un dato fijo: ahora se puede cambiar sin
 * cerrar sesión, y media interfaz tiene que enterarse. Antes el rol solo vivía
 * en `localStorage`, que no notifica a nadie.
 *
 * **Sigue escribiendo las mismas claves sueltas de `localStorage`** en lugar de
 * un blob propio (por eso no usa el middleware `persist`): los ~15 servicios de
 * la app leen `localStorage.getItem("role")`/`("sessionId")` directamente para
 * armar sus cabeceras, y romper eso obligaría a tocarlos todos de golpe. Así
 * conviven las dos vistas del mismo dato.
 */

export type Session = {
  sessionId: string;
  username: string;
  userId: number | null;
  /** Grupo activo. Es el Code de openMAINT, no la Description. */
  role: string;
  /** Todos los grupos de la cuenta; con más de uno se puede elegir y cambiar. */
  availableRoles: string[];
  /** Code → Description de openMAINT; es lo que se enseña en pantalla. */
  roleLabels: Record<string, string>;
  /** Nombre legible (`userDescription` de openMAINT). */
  name: string | null;
  employeeId: number | null;
  cleaningEmployeeId: number | null;
  tenantId: number | null;
};

type SessionState = Session & {
  setSession: (session: Session) => void;
  /** Tras un cambio de rol confirmado por el backend. */
  setRole: (role: string) => void;
  clear: () => void;
};

const EMPTY: Session = {
  sessionId: "",
  username: "",
  userId: null,
  role: "",
  availableRoles: [],
  roleLabels: {},
  name: null,
  employeeId: null,
  cleaningEmployeeId: null,
  tenantId: null,
};

/** `setItem(key, null)` guarda la cadena "null", que luego viaja en cabeceras. */
const write = (key: string, value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, String(value));
};

const readNumber = (key: string): number | null => {
  const parsed = Number(localStorage.getItem(key));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const readRoles = (): string[] => {
  try {
    const raw = localStorage.getItem("availableRoles");
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

const readLabels = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem("roleLabels");
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

/** Rehidrata desde las claves sueltas para sobrevivir a un refresco de página. */
const fromStorage = (): Session => ({
  sessionId: localStorage.getItem("sessionId") ?? "",
  username: localStorage.getItem("username") ?? "",
  userId: readNumber("userId"),
  role: localStorage.getItem("role") ?? "",
  availableRoles: readRoles(),
  roleLabels: readLabels(),
  name: localStorage.getItem("ownerName"),
  employeeId: readNumber("employeeId"),
  cleaningEmployeeId: readNumber("cleaningEmployeeId"),
  tenantId: readNumber("tenantId"),
});

const persist = (session: Session) => {
  write("sessionId", session.sessionId);
  write("username", session.username);
  write("userId", session.userId);
  write("role", session.role);
  write("ownerName", session.name);
  write("employeeId", session.employeeId);
  write("cleaningEmployeeId", session.cleaningEmployeeId);
  write("tenantId", session.tenantId);
  localStorage.setItem("availableRoles", JSON.stringify(session.availableRoles));
  localStorage.setItem("roleLabels", JSON.stringify(session.roleLabels));
};

export const useSessionStore = create<SessionState>()((set) => ({
  ...fromStorage(),
  setSession: (session) => {
    persist(session);
    set(session);
  },
  setRole: (role) => {
    write("role", role);
    set({ role });
  },
  clear: () => {
    localStorage.removeItem("availableRoles");
    localStorage.removeItem("roleLabels");
    set({ ...EMPTY });
    // Las claves sueltas las borra `clearSession()`, que además arrastra el
    // store de la tarea activa y los datos de invitado.
  },
}));

/** Para leer la sesión fuera de React (servicios, helpers). */
export const getSession = (): Session => useSessionStore.getState();

/** Roles que abren una vista distinta; ver `rolePalette`. */
export const hasMultipleRoles = () => getSession().availableRoles.length > 1;
