/**
 * Códigos de rol de openMAINT (el login devuelve el Code, no la Description).
 * `SuperUser` es el administrador; no existe un rol con Code `Admin`.
 *
 * Viven aquí y no en el service para que otros módulos puedan importarlos sin
 * arrastrar el service entero (y sin crear ciclos de import).
 */
export const SUPERVISOR_ROLES = [
  'SuperUser',
  'SupervisorLimpieza',
  'AsistenteSL',
];

export const isSupervisorRole = (role?: string) =>
  Boolean(role && SUPERVISOR_ROLES.includes(role));

/**
 * El Coordinador de limpiezas crea, completa, edita y cancela limpiezas y
 * mantiene los checklists. No ejecuta, no revisa y no reabre, así que su rol
 * NO se suma a `SUPERVISOR_ROLES`: ganaría la revisión, la reapertura y los
 * avisos de supervisión.
 */
export const COORDINATOR_ROLES = ['SuperUser', 'Coordinador'];

export const isCoordinatorRole = (role?: string) =>
  Boolean(role && COORDINATOR_ROLES.includes(role));

/** Lectura compartida (listado, detalle): supervisión o coordinación. */
export const isSupervisorOrCoordinatorRole = (role?: string) =>
  isSupervisorRole(role) || isCoordinatorRole(role);

/**
 * Quien solo es coordinador, sin ser supervisor. Es el único al que se le
 * aplican las restricciones de edición (solo limpiezas que no empezaron).
 */
export const isCoordinatorOnly = (role?: string) =>
  isCoordinatorRole(role) && !isSupervisorRole(role);
