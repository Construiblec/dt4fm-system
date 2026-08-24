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
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CompleteIncidentDto } from './dto/complete-incident.dto';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';

type UploadedImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

@ApiTags('Incidencias')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get('my')
  @ApiOperation({ summary: 'Obtener incidencias del empleado autenticado' })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiHeader({
    name: 'x-employee-id',
    description: 'ID de empleado asignado',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de incidencias obtenida con éxito',
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de cabecera faltantes o inválidos',
  })
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

  @Post(':id/start')
  @ApiOperation({
    summary: 'Registrar el inicio real del trabajo de una incidencia',
    description:
      'Sella `ExecStartDate` sin avanzar el flujo: el correctivo pasa de ' +
      '«Asignado» a «Ejecución». Es idempotente — si ya estaba iniciado ' +
      'devuelve la marca original sin sobrescribirla.',
  })
  @ApiParam({ name: 'id', description: 'ID de la incidencia', type: 'integer' })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Inicio registrado con éxito' })
  @ApiResponse({
    status: 400,
    description:
      'Cabecera de autorización faltante, o el incidente no está asignado',
  })
  async startIncident(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Authorization header is required');
    }

    return this.incidentsService.startIncident(id, sessionId);
  }

  @Post(':id/complete')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const isImage = /^image\/(png|jpeg|jpg|webp)$/i.test(file.mimetype);

        callback(
          isImage ? null : new BadRequestException('Solo se permiten imagenes'),
          isImage,
        );
      },
    }),
  )
  @ApiOperation({ summary: 'Completar o resolver una incidencia' })
  @ApiParam({ name: 'id', description: 'ID de la incidencia', type: 'integer' })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Datos para completar la incidencia e imagen opcional del resultado',
    schema: {
      type: 'object',
      properties: {
        notes: {
          type: 'string',
          description: 'Notas u observaciones de resolución',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Foto del trabajo finalizado',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Incidencia marcada como completada con éxito',
  })
  @ApiResponse({
    status: 400,
    description: 'Entrada inválida o cabecera de autorización faltante',
  })
  async completeIncident(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @Body(new ValidationPipe({ transform: true })) dto: CompleteIncidentDto,
    @UploadedFile() file?: UploadedImage,
  ) {
    if (!sessionId) {
      throw new BadRequestException('Authorization header is required');
    }
    console.log('complete incident');
    return this.incidentsService.completeIncident(id, sessionId, dto, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener el detalle de una incidencia por ID' })
  @ApiParam({ name: 'id', description: 'ID de la incidencia', type: 'integer' })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la incidencia obtenido con éxito',
  })
  @ApiResponse({
    status: 400,
    description: 'Cabecera de autorización faltante',
  })
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
  @ApiOperation({ summary: 'Crear una nueva incidencia' })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiHeader({
    name: 'x-employee-id',
    description: 'ID del empleado que reporta',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Datos del nuevo incidente con hasta 6 imágenes opcionales',
    schema: {
      type: 'object',
      properties: {
        buildingId: {
          type: 'integer',
          description: 'ID del edificio',
          example: 3456,
        },
        floorArea: {
          type: 'string',
          description: 'Área o piso',
          example: 'Piso 2',
        },
        notes: {
          type: 'string',
          description: 'Descripción detallada',
          example: 'Contacto suelto en el tomacorriente',
        },
        priority: {
          type: 'integer',
          description: 'Prioridad (1-Alta, 2-Media, 3-Baja)',
          example: 2,
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Imágenes del incidente (máx 6)',
        },
      },
      required: ['buildingId', 'floorArea', 'priority', 'notes'],
    },
  })
  @ApiResponse({ status: 201, description: 'Incidencia creada con éxito' })
  @ApiResponse({
    status: 400,
    description: 'Entrada inválida o cabeceras faltantes',
  })
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
