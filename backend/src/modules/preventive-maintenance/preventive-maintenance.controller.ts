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
  Res,
  UnauthorizedException,
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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CompletePreventiveMaintenanceDto } from './dto/complete-preventive-maintenance.dto';
import { GetHistoryQueryDto } from './dto/get-history-query.dto';
import { GetMyPreventiveMaintenancesQueryDto } from './dto/get-my-preventive-maintenances-query.dto';
import { SaveChecklistDto } from './dto/save-checklist.dto';
import { SuspendPreventiveMaintenanceDto } from './dto/suspend-preventive-maintenance.dto';
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

  // Antes de `:id`: Nest resuelve por orden de declaración y `ParseIntPipe`
  // rechazaría la ruta literal con un 400 confuso.
  @Get('suspension-reasons')
  @ApiOperation({
    summary: 'Obtener los motivos de suspensión disponibles',
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Motivos obtenidos con éxito' })
  @ApiResponse({ status: 502, description: 'OpenMAINT no respondió' })
  async getSuspensionReasons(@Headers('authorization') sessionId: string) {
    return this.preventiveMaintenanceService.getSuspensionReasons(
      this.requireSessionId(sessionId),
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

  @Get(':id/history')
  @ApiOperation({
    summary: 'Obtener los mantenimientos anteriores del mismo equipo',
    description:
      'Devuelve los preventivos ya completados sobre el equipo del ' +
      'mantenimiento indicado, excluyéndolo a él. Si el mantenimiento no ' +
      'tiene equipo asociado devuelve una lista vacía.',
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
  @ApiResponse({ status: 200, description: 'Historial obtenido con éxito' })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento preventivo no encontrado',
  })
  @ApiResponse({ status: 502, description: 'OpenMAINT no respondió' })
  async getEquipmentHistory(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @Query() query: GetHistoryQueryDto,
  ) {
    return this.preventiveMaintenanceService.getEquipmentHistory(
      this.requireSessionId(sessionId),
      id,
      query,
    );
  }

  @Get(':id/attachments')
  @ApiOperation({
    summary: 'Listar los archivos adjuntos de un mantenimiento preventivo',
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
  @ApiResponse({ status: 200, description: 'Adjuntos obtenidos con éxito' })
  @ApiResponse({
    status: 404,
    description: 'Mantenimiento preventivo no encontrado',
  })
  async getAttachments(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
  ) {
    return this.preventiveMaintenanceService.getAttachments(
      this.requireSessionId(sessionId),
      id,
    );
  }

  @Get(':id/attachments/:attachmentId/download')
  @ApiOperation({
    summary: 'Descargar el binario de un adjunto',
    description:
      'Acepta el token de sesión por cabecera o por query. Lo segundo es lo ' +
      'que permite usar la URL directamente en un `<a href>` o un `<img src>`.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del mantenimiento preventivo',
    type: 'integer',
  })
  @ApiParam({ name: 'attachmentId', description: 'ID del adjunto' })
  @ApiQuery({
    name: 'token',
    description: 'Token de sesión, alternativa a la cabecera `authorization`',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Binario del archivo' })
  @ApiResponse({ status: 401, description: 'Token de sesión no proveído' })
  @ApiResponse({ status: 404, description: 'Adjunto no encontrado' })
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') sessionIdFromHeader: string,
    @Query('token') tokenFromQuery: string | undefined,
    @Res() res: Response,
  ) {
    const sessionId = sessionIdFromHeader || tokenFromQuery;

    if (!sessionId) {
      throw new UnauthorizedException('Session token is required');
    }

    return this.preventiveMaintenanceService.streamAttachment(
      sessionId,
      id,
      attachmentId,
      res,
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

  @Post(':id/suspend')
  @ApiOperation({
    summary: 'Suspender un mantenimiento preventivo',
    description:
      'Guarda las respuestas recibidas, marca como N.D. las actividades que ' +
      'sigan sin resolver y pasa el mantenimiento a Suspensión.',
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
  @ApiResponse({ status: 201, description: 'Mantenimiento suspendido' })
  @ApiResponse({
    status: 400,
    description: 'Cabecera de autorización faltante o motivo inválido',
  })
  @ApiResponse({
    status: 409,
    description: 'El mantenimiento no está en ejecución o ya está suspendido',
  })
  async suspendPreventiveMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @Body(new ValidationPipe({ transform: true }))
    dto: SuspendPreventiveMaintenanceDto,
  ) {
    return this.preventiveMaintenanceService.suspendPreventiveMaintenance(
      this.requireSessionId(sessionId),
      id,
      dto,
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
