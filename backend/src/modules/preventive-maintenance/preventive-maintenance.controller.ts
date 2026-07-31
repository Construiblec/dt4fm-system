import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CompletePreventiveMaintenanceDto } from './dto/complete-preventive-maintenance.dto';
import { GetMyPreventiveMaintenancesQueryDto } from './dto/get-my-preventive-maintenances-query.dto';
import { SaveChecklistDto } from './dto/save-checklist.dto';
import type { UploadedImage } from './preventive-maintenance.openmaint.service';
import { PreventiveMaintenanceService } from './preventive-maintenance.service';

@ApiTags('Mantenimiento preventivo')
@Controller('preventive-maintenance')
export class PreventiveMaintenanceController {
  constructor(
    private readonly preventiveMaintenanceService: PreventiveMaintenanceService,
  ) {}

  @Get('my')
  @ApiOperation({
    summary: 'Obtener los mantenimientos preventivos asignados al empleado',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiHeader({
    name: 'x-employee-id',
    description: 'ID del empleado asignado (Assignee)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de mantenimientos preventivos obtenida con éxito',
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de cabecera faltantes o inválidos',
  })
  @ApiResponse({ status: 502, description: 'OpenMAINT no respondió' })
  async getMyPreventiveMaintenances(
    @Headers('authorization') sessionId: string,
    @Headers('x-employee-id') employeeIdHeader: string,
    @Query() query: GetMyPreventiveMaintenancesQueryDto,
  ) {
    return this.preventiveMaintenanceService.getMyPreventiveMaintenances(
      this.requireSessionId(sessionId),
      this.parseEmployeeId(employeeIdHeader),
      query,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener el detalle de un mantenimiento preventivo por ID',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del mantenimiento preventivo',
    type: 'integer',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Detalle obtenido con éxito' })
  @ApiResponse({
    status: 400,
    description: 'Cabecera de autorización faltante',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento preventivo no encontrado',
  })
  async getPreventiveMaintenanceDetail(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
  ) {
    return this.preventiveMaintenanceService.getPreventiveMaintenanceDetail(
      this.requireSessionId(sessionId),
      id,
    );
  }

  @Post(':id/start')
  @ApiOperation({
    summary: 'Abrir el mantenimiento e iniciar su ejecución',
    description:
      'Si el mantenimiento está en Aceptación lo avanza a Ejecución en ' +
      'OpenMAINT. Es idempotente: si ya está en ejecución o cerrado, solo ' +
      'devuelve el detalle. Responde con el detalle ya actualizado.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del mantenimiento preventivo',
    type: 'integer',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Detalle actualizado' })
  @ApiResponse({
    status: 400,
    description: 'Cabecera de autorización faltante',
  })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento preventivo no encontrado',
  })
  async startExecution(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
  ) {
    return this.preventiveMaintenanceService.startExecution(
      this.requireSessionId(sessionId),
      id,
    );
  }

  @Put(':id/checklist')
  @ApiOperation({
    summary: 'Guardar las respuestas del checklist del mantenimiento',
    description:
      'Escribe los resultados de las actividades conservando el resto del ' +
      'registro. Es requisito para poder finalizar el mantenimiento.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del mantenimiento preventivo',
    type: 'integer',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Checklist actualizado' })
  @ApiResponse({
    status: 400,
    description: 'Cabecera de autorización faltante o respuestas inválidas',
  })
  @ApiResponse({
    status: 404,
    description: 'El mantenimiento no existe o no tiene checklist',
  })
  async saveChecklist(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @Body(new ValidationPipe({ transform: true })) dto: SaveChecklistDto,
  ) {
    return this.preventiveMaintenanceService.savePreventiveChecklist(
      this.requireSessionId(sessionId),
      id,
      dto.items,
    );
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
  @ApiOperation({ summary: 'Finalizar un mantenimiento preventivo' })
  @ApiParam({
    name: 'id',
    description: 'ID del mantenimiento preventivo',
    type: 'integer',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Notas de cierre e imagen opcional de evidencia',
    schema: {
      type: 'object',
      properties: {
        notes: {
          type: 'string',
          description: 'Observaciones del trabajo realizado',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Foto del trabajo finalizado',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Mantenimiento completado' })
  @ApiResponse({
    status: 400,
    description: 'Cabecera de autorización faltante',
  })
  @ApiResponse({
    status: 409,
    description: 'El mantenimiento no está en ejecución',
  })
  async completePreventiveMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @Body(new ValidationPipe({ transform: true }))
    dto: CompletePreventiveMaintenanceDto,
    @UploadedFile() file?: UploadedImage,
  ) {
    return this.preventiveMaintenanceService.completePreventiveMaintenance(
      this.requireSessionId(sessionId),
      id,
      dto,
      file,
    );
  }

  private requireSessionId(sessionId: string): string {
    if (!sessionId) {
      throw new BadRequestException('Authorization header is required');
    }

    return sessionId;
  }

  private parseEmployeeId(employeeIdHeader: string): number {
    const employeeId = Number(employeeIdHeader);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new BadRequestException('x-employee-id header is required');
    }

    return employeeId;
  }
}
