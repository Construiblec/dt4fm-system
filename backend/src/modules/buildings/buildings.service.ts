import { Injectable } from '@nestjs/common';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';

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
}
