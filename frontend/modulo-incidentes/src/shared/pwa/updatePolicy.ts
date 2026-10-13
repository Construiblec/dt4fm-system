/**
 * Cuándo se puede aplicar una versión nueva de la app sin preguntar.
 *
 * Aplicarla recarga la página, así que solo se hace en pantallas de lista o de
 * inicio, donde no hay nada sin guardar. Es una lista **permitida**: una
 * pantalla nueva que nadie agregó aquí cuenta como insegura y no recarga por
 * accidente a alguien a mitad de un formulario o de una foto.
 *
 * Quedan fuera a propósito la ejecución de una limpieza, reportar incidencia,
 * los detalles de incidencia, preventivo y supervisión (subida de fotos y
 * evidencia), el editor de checklists, la nueva limpieza y la sincronización.
 */
const SAFE_PATHS = new Set([
  // Sin sesión
  "/",
  "/login",
  "/seleccionar-rol",
  // Comunes
  "/notificaciones",
  "/cuenta",
  // Inicio de cada rol
  "/dashboard",
  "/supervisor",
  "/asistente-sl",
  "/supervisor-mantenimiento",
  "/supervisor-cav/autorizaciones",
  "/owner/dashboard",
]);

/**
 * Listas de la coordinación. Encima de ellas se abre la ficha de una limpieza
 * como panel lateral (`?limpieza=ID`), que puede tener un formulario a medias.
 */
const COORDINATOR_LISTS = new Set([
  "/coordinador",
  "/coordinador/pendientes",
  "/coordinador/limpiezas",
  "/coordinador/agenda",
  "/coordinador/checklists",
]);

export const isSafeToUpdate = (location: {
  pathname: string;
  search: string;
}): boolean => {
  const path = location.pathname.replace(/\/+$/, "") || "/";

  if (COORDINATOR_LISTS.has(path)) {
    return !new URLSearchParams(location.search).has("limpieza");
  }

  return SAFE_PATHS.has(path);
};
