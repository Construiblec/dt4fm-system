/**
 * Alcance del envío masivo: define a qué subconjunto de la clase Tenant
 * de openMAINT se enviará el comunicado.
 *
 * Se mapea contra el atributo OccupancyType (LOOKUP) de Tenant.
 * Los códigos concretos del lookup se resuelven en NotificationsService
 * a partir de configuración, no se hardcodean aquí.
 */
export enum RecipientScope {
  ALL = 'all',
  OWNERS = 'owners',
  TENANTS = 'tenants',
}
