import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import {
  BuildingLocationsDto,
  LocationAreaDto,
  LocationAreaKind,
  LocationFloorDto,
} from './dto/building-locations.dto';

type OpenmaintBuildingCard = {
  _id: number;
  Code: string;
  Name: string;
  Description: string;
};

type OpenmaintBuildingsResponse = {
  success: boolean;
  data: OpenmaintBuildingCard[];
};

type OpenmaintLocationCard = {
  _id: number;
  Code?: string | null;
  Name?: string | null;
  Description?: string | null;
  Building?: number | null;
  Floor?: number | null;
};

type OpenmaintLocationsResponse = {
  data?: OpenmaintLocationCard[];
};

// numeric:true ordena R-P2 antes que R-P10 (el Code de Floor no tiene atributo numérico propio)
const collator = new Intl.Collator('es', {
  numeric: true,
  sensitivity: 'base',
});

@Injectable()
export class BuildingsService {
  constructor(private readonly openmaintService: OpenmaintService) {}

  async getBuildings(sessionId: string) {
    const response = (await this.openmaintService.getBuildings(
      sessionId,
    )) as OpenmaintBuildingsResponse;

    return response.data.map((building) => ({
      id: building._id,
      code: building.Code,
      name: building.Name,
      description: building.Description,
    }));
  }

  async getBuildingLocations(
    buildingId: number,
    sessionId: string,
  ): Promise<BuildingLocationsDto> {
    if (!sessionId?.trim()) {
      throw new BadRequestException('Cabecera de autorización requerida');
    }

    const [floorsResponse, unitsResponse, commonAreasResponse] =
      await this.fetchLocationCards(buildingId, sessionId);

    const floors: LocationFloorDto[] = (floorsResponse.data ?? []).map(
      (card) => ({
        id: card._id,
        code: card.Code ?? null,
        name: card.Name ?? null,
        description: card.Description ?? null,
        label: this.resolveLabel(card),
        areas: [],
      }),
    );

    const floorsById = new Map(floors.map((floor) => [floor.id, floor]));
    const unassignedAreas: LocationAreaDto[] = [];

    const collect = (
      cards: OpenmaintLocationCard[],
      kind: LocationAreaKind,
    ) => {
      for (const card of cards) {
        const area: LocationAreaDto = {
          id: card._id,
          code: card.Code ?? null,
          name: card.Name ?? null,
          description: card.Description ?? null,
          label: this.resolveLabel(card),
          kind,
          floorId: card.Floor ?? null,
        };

        // Si la planta no pertenece a este edificio el área se muestra igual,
        // pero agrupada aparte en vez de desaparecer del formulario.
        const floor =
          area.floorId !== null ? floorsById.get(area.floorId) : undefined;

        if (floor) {
          floor.areas.push(area);
        } else {
          unassignedAreas.push(area);
        }
      }
    };

    collect(unitsResponse.data ?? [], 'Unit');
    collect(commonAreasResponse.data ?? [], 'CommonArea');

    floors.sort(this.compareLocations);
    floors.forEach((floor) => floor.areas.sort(this.compareLocations));
    unassignedAreas.sort(this.compareLocations);

    return { buildingId, floors, unassignedAreas };
  }

  private async fetchLocationCards(
    buildingId: number,
    sessionId: string,
  ): Promise<
    [
      OpenmaintLocationsResponse,
      OpenmaintLocationsResponse,
      OpenmaintLocationsResponse,
    ]
  > {
    try {
      return (await Promise.all([
        this.openmaintService.getFloorsByBuilding(buildingId, sessionId),
        this.openmaintService.getUnitsByBuilding(buildingId, sessionId),
        this.openmaintService.getCommonAreasByBuilding(buildingId, sessionId),
      ])) as [
        OpenmaintLocationsResponse,
        OpenmaintLocationsResponse,
        OpenmaintLocationsResponse,
      ];
    } catch (error) {
      const status = error?.response?.status;

      console.error('[buildings] getBuildingLocations error', {
        buildingId,
        status,
        message: error?.message,
      });

      if (status === 401 || status === 403) {
        throw new UnauthorizedException('Sesión de OpenMAINT expirada');
      }

      throw new BadGatewayException(
        'No se pudieron obtener las plantas y áreas del edificio',
      );
    }
  }

  private resolveLabel(card: OpenmaintLocationCard): string {
    return (
      card.Description?.trim() ||
      card.Name?.trim() ||
      card.Code?.trim() ||
      String(card._id)
    );
  }

  private compareLocations(
    a: { code: string | null; label: string },
    b: { code: string | null; label: string },
  ): number {
    const byCode = collator.compare(a.code ?? '', b.code ?? '');

    return byCode !== 0 ? byCode : collator.compare(a.label, b.label);
  }
}
