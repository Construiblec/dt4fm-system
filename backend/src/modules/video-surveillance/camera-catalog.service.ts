import { Injectable, Logger } from '@nestjs/common';
import { AccessIotGateway } from '../access-control/access-iot.gateway';
import { AccessIotCamera } from '../access-control/access-iot.types';
import { BuildingCatalogService } from '../access-control/building-catalog.service';

export interface CameraBuildingView {
  buildingId: number;
  name: string;
  /** `false` si el edificio no aportó cámaras en la última consulta: su gateway no respondió. */
  reachable: boolean;
  cameras: { cameraId: string; name: string }[];
}

export interface CameraOverview {
  /** La VPS no respondió y se sirve lo último conocido. */
  stale: boolean;
  buildings: CameraBuildingView[];
}

/**
 * Cámaras conocidas, en memoria. Una respuesta corta no borra nada: un edificio
 * caído no aporta cámaras. Solo un `404 not_found` al pedir sesión retira una.
 */
@Injectable()
export class CameraCatalogService {
  private readonly logger = new Logger(CameraCatalogService.name);
  private readonly known = new Map<string, AccessIotCamera>();
  private reachable = new Set<number>();

  constructor(
    private readonly iot: AccessIotGateway,
    private readonly buildings: BuildingCatalogService,
  ) {}

  async overview(): Promise<CameraOverview> {
    let stale = false;

    try {
      const cameras = await this.iot.listCameras();

      for (const camera of cameras) this.known.set(camera.cameraId, camera);
      this.reachable = new Set(cameras.map((camera) => camera.buildingId));
    } catch (error) {
      if (this.known.size === 0) throw error;

      stale = true;
      this.logger.warn(
        `Catálogo de cámaras no disponible; se sirve el conocido: ${this.describe(error)}`,
      );
    }

    const names = await this.buildingNames();
    const byBuilding = new Map<number, AccessIotCamera[]>();

    for (const camera of this.known.values()) {
      byBuilding.set(camera.buildingId, [
        ...(byBuilding.get(camera.buildingId) ?? []),
        camera,
      ]);
    }

    return {
      stale,
      buildings: [...byBuilding.entries()]
        .map(([buildingId, cameras]) => ({
          buildingId,
          name: names.get(buildingId) ?? `Edificio ${buildingId}`,
          reachable: this.reachable.has(buildingId),
          cameras: cameras
            .sort((a, b) => a.cameraId.localeCompare(b.cameraId))
            .map(({ cameraId, name }) => ({ cameraId, name })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  find(cameraId: string): AccessIotCamera | undefined {
    return this.known.get(cameraId);
  }

  forget(cameraId: string): void {
    this.known.delete(cameraId);
  }

  private async buildingNames(): Promise<Map<number, string>> {
    try {
      const buildings = await this.buildings.list();

      return new Map(
        buildings.map((building) => [building.buildingId, building.name]),
      );
    } catch {
      return new Map();
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
