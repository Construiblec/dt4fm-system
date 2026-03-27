import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CompleteIncidentDto } from './dto/complete-incident.dto';
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

  @Get('my')
  async getMyIncidents(
    @Headers('authorization') sessionId: string,
    @Headers('x-employee-id') employeeIdHeader: string,
  ) {
    const employeeId = Number(employeeIdHeader);

    if (!sessionId) {
      throw new BadRequestException('Authorization header is required');
    }

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new BadRequestException('x-employee-id header is required');
    }

    return this.incidentsService.getMyIncidents(employeeId, sessionId);
  }

  @Post(':id/complete')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const isImage = /^image\/(png|jpeg|jpg|webp)$/i.test(file.mimetype)

        callback(isImage ? null : new BadRequestException('Solo se permiten imagenes'), isImage)
      }
    }),
  )
  async completeIncident(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @Body(new ValidationPipe({ transform: true })) dto: CompleteIncidentDto,
    @UploadedFile() file?: UploadedImage,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Authorization header is required');
    }

    return this.incidentsService.completeIncident(id, sessionId, dto, file);
  }

  @Get(':id')
  async getIncidentDetail(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Authorization header is required');
    }

    return this.incidentsService.getIncidentDetail(id, sessionId);
  }

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
