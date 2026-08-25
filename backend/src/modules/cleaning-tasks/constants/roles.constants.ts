/**
 * Códigos de rol de openMAINT (el login devuelve el Code, no la Description).
 * `SuperUser` es el administrador; no existe un rol con Code `Admin`.
 *
 * Viven aquí y no en el service para que otros módulos puedan importarlos sin
 * arrastrar el service entero (y sin crear ciclos de import).
 */
export const SUPERVISOR_ROLES = ['SuperUser', 'SupervisorLimpieza'];

export const isSupervisorRole = (role?: string) =>
  Boolean(role && SUPERVISOR_ROLES.includes(role));
