import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AccessIotGateway } from './access-iot.gateway';
import {
  AccessIotBuilding,
  AccessIotDevice,
  DeviceScope,
} from './access-iot.types';

const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Qué edificios tienen control de accesos. Se consulta a la VPS y no se
 * codifica aquí: añadir hardware a un edificio nuevo debe ser una operación del
 * lado IoT, no un despliegue del backend.
 */
@Injectable()
export class BuildingCatalogService implements OnModuleInit {
  private readonly logger = new Logger(BuildingCatalogService.name);
  private cache: AccessIotBuilding[] | null = null;
  private cachedAt = 0;
  private devicesCache: AccessIotDevice[] | null = null;
  private devicesCachedAt = 0;
  private sitesCache: Map<number, string> | null = null;
  private sitesCachedAt = 0;

  constructor(private readonly iot: AccessIotGateway) {}

  /** En frío, el primer webhook pagaría la consulta a la VPS dentro del plazo de Hostaway. */
  onModuleInit(): void {
    void this.list().catch((error) =>
      this.logger.warn(
        `No se pudo precargar el catálogo de edificios: ${this.describe(error)}`,
      ),
    );
  }

  async list(): Promise<AccessIotBuilding[]> {
    if (this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      this.cache = await this.iot.listBuildings();
      this.cachedAt = Date.now();
      return this.cache;
    } catch (error) {
      // Servir el catálogo viejo es mejor que negar cobertura por un corte de
      // red: negarla dejaría de emitir credenciales que sí tocaban.
      if (this.cache) {
        this.logger.warn(
          `Catálogo de edificios no disponible; se sirve el cacheado: ${this.describe(error)}`,
        );
        return this.cache;
      }

      throw error;
    }
  }

  /**
   * Fuerza a releer el catálogo en la próxima consulta. Sirve cuando el equipo
   * IoT instala hardware en un edificio nuevo y no se quiere esperar al TTL ni
   * reiniciar el proceso.
   */
  invalidate(): void {
    this.cache = null;
    this.cachedAt = 0;
    this.devicesCache = null;
    this.devicesCachedAt = 0;
    this.sitesCache = null;
    this.sitesCachedAt = 0;
  }

  /**
   * Para resolver qué puerta es cuál; su `online` puede tener 10 minutos.
   * `refresh` relee de la VPS y, si falla, lanza en vez de servir la caché.
   */
  async devices(refresh = false): Promise<AccessIotDevice[]> {
    if (
      !refresh &&
      this.devicesCache &&
      Date.now() - this.devicesCachedAt < CACHE_TTL_MS
    ) {
      return this.devicesCache;
    }

    try {
      this.devicesCache = await this.iot.listDevices();
      this.devicesCachedAt = Date.now();
      return this.devicesCache;
    } catch (error) {
      if (this.devicesCache && !refresh) {
        this.logger.warn(
          `Inventario de puertas no disponible; se sirve el cacheado: ${this.describe(error)}`,
        );
        return this.devicesCache;
      }

      throw error;
    }
  }

  /** `buildingId → siteId` según `/v1/health`, el único endpoint que publica el `siteId`. */
  async siteIds(): Promise<Map<number, string>> {
    if (this.sitesCache && Date.now() - this.sitesCachedAt < CACHE_TTL_MS) {
      return this.sitesCache;
    }

    try {
      const { buildings } = await this.iot.getHealth();
      this.sitesCache = new Map(
        buildings
          .filter((building) => !!building.siteId)
          .map((building) => [building.buildingId, building.siteId!]),
      );
      this.sitesCachedAt = Date.now();
      return this.sitesCache;
    } catch (error) {
      if (this.sitesCache) {
        this.logger.warn(
          `Salud de la VPS no disponible; se sirven los sitios cacheados: ${this.describe(error)}`,
        );
        return this.sitesCache;
      }

      throw error;
    }
  }

  async siteIdOf(buildingId: number): Promise<string | null> {
    return (await this.siteIds()).get(buildingId) ?? null;
  }

  /** Scopes que tiene el edificio; `null` si el catálogo no lo conoce. */
  async buildingScopes(buildingId: number): Promise<DeviceScope[] | null> {
    const building = (await this.list()).find(
      (item) => item.buildingId === buildingId,
    );

    return building ? building.scopes : null;
  }

  /** `deviceId → scope`, para leer por scope un resultado `partial`. */
  async deviceScopes(): Promise<Map<string, DeviceScope>> {
    return new Map(
      (await this.devices()).map((device) => [device.deviceId, device.scope]),
    );
  }

  async isCovered(buildingId: number): Promise<boolean> {
    const buildings = await this.list();

    return buildings.some((building) => building.buildingId === buildingId);
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
