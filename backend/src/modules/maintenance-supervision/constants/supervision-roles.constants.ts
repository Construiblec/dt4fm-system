/**
 * Roles que pueden supervisar mantenimiento.
 *
 * Mismo patrón que `SUPERVISOR_ROLES` de limpieza
 * (`cleaning-tasks.service.ts:42`). `SuperUser` es el administrador; no existe
 * un rol con Code `Admin`.
 *
 * OJO: el header `x-role` que alimenta esta comprobación sale de
 * `localStorage` en el navegador, así que es manipulable. **La barrera real
 * son los permisos de grupo de la sesión en OpenMAINT** — el grupo
 * `SupervisorMantenimiento` tiene grants `wf_plus` sobre `CorrectiveMaint` y
 * `PreventiveMaint`, y lectura sobre `Employee`. Esta lista solo evita que un
 * rol equivocado dispare llamadas por accidente.
 */
export const MAINTENANCE_SUPERVISOR_ROLES = [
  'SuperUser',
  'SupervisorMantenimiento',
];

export const isMaintenanceSupervisorRole = (role?: string): boolean =>
  Boolean(role && MAINTENANCE_SUPERVISOR_ROLES.includes(role));

/**
 * Subclase de `Employee` que identifica a un proveedor externo. OpenMAINT la
 * devuelve en el campo `_type` de la tarjeta. Un proveedor pertenece a un solo
 * equipo, así que sus mantenimientos no son reasignables.
 */
export const SUPPLIER_EMPLOYEE_TYPE = 'SupplierEmployee';
