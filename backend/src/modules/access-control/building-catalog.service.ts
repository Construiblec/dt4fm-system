import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AccessIotGateway } from './access-iot.gateway';
import { AccessIotBuilding } from './access-iot.types';

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
  }

  async isCovered(buildingId: number): Promise<boolean> {
    const buildings = await this.list();

    return buildings.some((building) => building.buildingId === buildingId);
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
