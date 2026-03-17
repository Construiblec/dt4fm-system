import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UploadedFiles,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';

type UploadedImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('images', 6, {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async createIncident(
    @Headers('authorization') sessionId: string,
    @Headers('x-employee-id') employeeIdHeader: string,
    @Body(new ValidationPipe({ transform: true })) dto: CreateIncidentDto,
    @UploadedFiles() images: UploadedImage[] = [],
  ) {
    const employeeId = Number(employeeIdHeader);

    if (!sessionId) {
      throw new BadRequestException('Authorization header is required');
    }

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new BadRequestException('x-employee-id header is required');
    }

    return this.incidentsService.createIncident(
      sessionId,
      employeeId,
      dto,
      images,
    );
  }
}
