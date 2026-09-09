import {
  HardHat,
  Home,
  KeyRound,
  ListChecks,
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
 * MaintOffice, SupervisorLimpieza, SupervisorMantenimiento, AsistenteSL,
 * AdminOffice, TPM.
 *
 * `SupervisorCAV` es la excepción: el grupo **todavía no existe en
 * openMAINT**. Se declara aquí por adelantado para que la app ya sepa qué
 * pantalla y qué color le corresponden en cuanto el grupo se cree del lado de
 * openMAINT — hasta entonces, ninguna cuenta real lo trae en `availableRoles`
 * y el selector de rol no lo va a mostrar. El cian es provisional: pendiente
 * de que producto confirme el color (no choca con los otros tres, pero no está
 * validado con nadie más).
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
  /**
   * Asiste al Supervisor de Limpieza. En openMAINT el grupo `AsistenteSL`
   * tiene escritura sobre `CleaningTask` y `CorrectiveMaint`, pero
   * **ninguna sobre `PreventiveMaint`**: un panel de preventivos le devolvería
   * un 403, así que no se le ofrece.
   *
   * Tiene su propia ruta (`/asistente-sl`) para que `getSelectableRoles`
   * lo muestre como opción independiente de `SupervisorLimpieza` cuando la
   * cuenta tiene ambos grupos. El panel muestra exactamente los mismos datos
   * (tareas Completed/Reviewed) porque los permisos son equivalentes.
   *
   * El fucsia es provisional, pendiente de que producto lo valide: se eligió
   * cercano al violeta del Supervisor de Limpieza para señalar el parentesco,
   * pero separado para que no se confundan en el selector.
   */
  AsistenteSL: {
    name: "Asistente de Supervisión de Limpiezas",
    short: "Asistencia",
    desc: "Apoyo a supervisión de limpiezas",
    icon: ListChecks,
    dot: "bg-fuchsia-600",
    text: "text-fuchsia-700",
    soft: "bg-fuchsia-50",
    ring: "border-fuchsia-600",
    solid: "bg-fuchsia-600",
    homeRoute: "/asistente-sl",
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
  /**
   * Solo la subsección Autorizaciones está implementada; Disuasión, Acceso
   * remoto y Eventos quedan para cuando se decida el resto del alcance.
   */
  SupervisorCAV: {
    name: "Supervisor CAV",
    short: "Accesos",
    desc: "Autorizaciones de acceso",
    icon: KeyRound,
    dot: "bg-cyan-600",
    text: "text-cyan-700",
    soft: "bg-cyan-50",
    ring: "border-cyan-600",
    solid: "bg-cyan-600",
    homeRoute: "/supervisor-cav/autorizaciones",
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

  const fromOpenmaint = labels?.[code];

  // Algunos grupos tienen la Description igual que el Code ("AsistenteSL"):
  // no aporta nada y se lee mal en el chip, así que ahí gana el catálogo.
  if (fromOpenmaint && fromOpenmaint !== code) {
    return fromOpenmaint;
  }

  return ROLE_VIEWS[code]?.name ?? fromOpenmaint ?? code;
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
