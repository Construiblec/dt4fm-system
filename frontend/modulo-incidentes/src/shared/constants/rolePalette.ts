import {
  HardHat,
  Home,
  SprayCan,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Catálogo de roles: cómo se llama cada grupo de openMAINT en la interfaz, de
 * qué color es y a qué pantalla lleva.
 *
 * Igual que `statusPalette.ts`, es la **fuente única**: no declares nombres,
 * colores ni rutas de rol fuera de aquí. Antes esto estaba repartido entre
 * `SUPERVISOR_HOME_ROUTES`, los literales de cada dashboard y la navegación del
 * login.
 *
 * Ojo con los códigos: openMAINT devuelve el **Code** del grupo, no su
 * Description. El Code de "TPM Equipment" es `MaintOffice` y el de "Supervisor
 * Mantenimientos" es `SupervisorMantenimiento`. Códigos existentes en la
 * instancia: Requester, SuperUser, Guest, Supplier, Propietarios, Team,
 * MaintOffice, SupervisorLimpieza, SupervisorMantenimiento, AdminOffice, TPM.
 */

export type RoleView = {
  /** Nombre completo, para el selector. */
  name: string;
  /** Etiqueta corta para el chip de la cabecera. */
  short: string;
  desc: string;
  icon: LucideIcon;
  /** Punto y texto del chip. */
  dot: string;
  text: string;
  /** Fondo suave del chip y del icono. */
  soft: string;
  /** Borde de la tarjeta seleccionada en el selector. */
  ring: string;
  /** Relleno del botón principal del selector. */
  solid: string;
  homeRoute: string;
};

/**
 * Grupos que abren una vista propia. El resto (`Guest`, `Requester`,
 * `AdminOffice`, `TPM`, `SuperUser`) existen en openMAINT pero no cambian nada
 * en esta app.
 *
 * Ojo: figurar aquí sirve para **saber a qué pantalla lleva** un rol, que no es
 * lo mismo que poder elegirlo. Lo segundo lo decide `getSelectableRoles`.
 */
export const ROLE_VIEWS: Record<string, RoleView> = {
  SupervisorMantenimiento: {
    name: "Supervisor de Mantenimiento",
    short: "Mantenimiento",
    desc: "Correctivo y preventivo",
    icon: HardHat,
    dot: "bg-blue-600",
    text: "text-blue-700",
    soft: "bg-blue-50",
    ring: "border-blue-600",
    solid: "bg-blue-600",
    homeRoute: "/supervisor-mantenimiento",
  },
  SupervisorLimpieza: {
    name: "Supervisor de Limpieza",
    short: "Limpieza",
    desc: "Fases y revisiones",
    icon: SprayCan,
    dot: "bg-violet-600",
    text: "text-violet-700",
    soft: "bg-violet-50",
    ring: "border-violet-600",
    solid: "bg-violet-600",
    homeRoute: "/supervisor",
  },
  Propietarios: {
    name: "Residente",
    short: "Residente",
    desc: "Mis unidades y pagos",
    icon: Home,
    dot: "bg-amber-600",
    text: "text-amber-700",
    soft: "bg-amber-50",
    ring: "border-amber-600",
    solid: "bg-amber-600",
    homeRoute: "/owner/dashboard",
  },
};

/**
 * Grupos que comparten el dashboard de ejecución. Son tres códigos distintos en
 * openMAINT para lo mismo de cara al usuario, así que se muestran como una sola
 * opción: si no, alguien con `MaintOffice` + `Supplier` + `Team` vería tres
 * tarjetas idénticas que llevan al mismo sitio.
 */
const EXECUTION_ROLES = ["MaintOffice", "Supplier", "Team"];

const EXECUTION_VIEW: RoleView = {
  name: "Ejecutor de Tareas",
  short: "Ejecución",
  desc: "Mis tareas asignadas",
  icon: Wrench,
  dot: "bg-teal-600",
  text: "text-teal-700",
  soft: "bg-teal-50",
  ring: "border-teal-600",
  solid: "bg-teal-600",
  homeRoute: "/dashboard",
};

/** Para roles sin vista propia: entran al dashboard de ejecución, como antes. */
const FALLBACK_VIEW = EXECUTION_VIEW;

export const getRoleView = (role?: string | null): RoleView => {
  if (!role) {
    return FALLBACK_VIEW;
  }

  if (EXECUTION_ROLES.includes(role)) {
    return EXECUTION_VIEW;
  }

  return ROLE_VIEWS[role] ?? FALLBACK_VIEW;
};

export type SelectableRole = RoleView & { code: string };

/**
 * Nombre que se le enseña al usuario: la **Description** que el grupo tiene en
 * openMAINT (`MaintOffice` → "TPM Equipment"), que es como lo llaman ahí. El
 * `name` del catálogo solo entra si openMAINT no devolvió etiquetas.
 */
export const getRoleLabel = (
  code: string | null | undefined,
  labels: Record<string, string> | undefined,
) => {
  if (!code) {
    return "";
  }

  return labels?.[code] ?? ROLE_VIEWS[code]?.name ?? code;
};

/**
 * Roles que existen y tienen su vista, pero **nunca se ofrecen como opción**.
 *
 * `Propietarios` es una condición de la persona, no un modo de trabajo: un
 * residente es residente y nadie del equipo entra a la app como si lo fuera,
 * aunque openMAINT le tenga asignado ese grupo. Sigue en `ROLE_VIEWS` porque el
 * residente tiene que aterrizar en su dashboard al iniciar sesión.
 */
const NON_SWITCHABLE_ROLES = ["Propietarios"];

/**
 * Roles que se le ofrecen al usuario, deduplicados por destino: dos grupos que
 * abren la misma pantalla se presentan como una sola opción, con el primer
 * código que tenga la cuenta (cualquiera sirve, openMAINT los trata igual).
 */
export const getSelectableRoles = (
  availableRoles: string[],
): SelectableRole[] => {
  const seen = new Set<string>();

  return availableRoles.reduce<SelectableRole[]>((options, code) => {
    if (NON_SWITCHABLE_ROLES.includes(code)) {
      return options;
    }

    // Un grupo sin vista propia no añade nada al selector; solo dejaría al
    // usuario donde ya está.
    const isKnown = code in ROLE_VIEWS || EXECUTION_ROLES.includes(code);

    if (!isKnown) {
      return options;
    }

    const view = getRoleView(code);

    if (seen.has(view.homeRoute)) {
      return options;
    }

    seen.add(view.homeRoute);
    options.push({ ...view, code });

    return options;
  }, []);
};
