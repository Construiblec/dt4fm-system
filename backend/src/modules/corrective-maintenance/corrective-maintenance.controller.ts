import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
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
import { GetHistoryQueryDto } from '../preventive-maintenance/dto/get-history-query.dto';
import type { UploadableFile } from '../maintenance-supervision/corrective-maint.openmaint.service';
import { CorrectiveDocumentsService } from './corrective-documents.service';

/** Documentos y fotos: aquí sí se aceptan imágenes, a diferencia del preventivo. */
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Documentación de un correctivo, común al técnico y al supervisor: adjuntos
 * propios, documentos del equipo intervenido e historial de ese equipo.
 */
@ApiTags('Mantenimiento correctivo')
@ApiHeader({
  name: 'authorization',
  description: 'Token de sesión de OpenMAINT',
  required: false,
})
@Controller('corrective-maintenance')
export class CorrectiveMaintenanceController {
  constructor(private readonly service: CorrectiveDocumentsService) {}

  @Get(':id/attachments')
  @ApiOperation({ summary: 'Listar los archivos adjuntos del correctivo' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Adjuntos obtenidos con éxito' })
  @ApiResponse({ status: 404, description: 'Correctivo no encontrado' })
  getAttachments(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
  ) {
    return this.service.getAttachments(this.requireSessionId(sessionId), id);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        const allowed = ALLOWED_MIMETYPES.includes(file.mimetype);

        callback(
          allowed
            ? null
            : new BadRequestException(
                'Solo se permiten documentos (PDF, Word o Excel) o fotos',
              ),
          allowed,
        );
      },
    }),
  )
  @ApiOperation({
    summary: 'Adjuntar un documento o una foto al correctivo',
    description: 'Responde con la lista de adjuntos ya actualizada.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Archivo adjuntado' })
  @ApiResponse({ status: 400, description: 'Tipo de archivo no permitido' })
  @ApiResponse({ status: 409, description: 'El correctivo está cerrado' })
  uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @UploadedFile() file?: UploadableFile,
  ) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo');
    }

    return this.service.uploadAttachment(
      this.requireSessionId(sessionId),
      id,
      file,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({
    summary: 'Eliminar un archivo adjunto del correctivo',
    description:
      'Solo con el correctivo abierto; el informe generado no se borra.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'attachmentId' })
  @ApiResponse({ status: 200, description: 'Archivo eliminado' })
  @ApiResponse({ status: 404, description: 'Adjunto no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Correctivo cerrado o informe generado',
  })
  deleteAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') sessionId: string,
  ) {
    return this.service.deleteAttachment(
      this.requireSessionId(sessionId),
      id,
      attachmentId,
    );
  }

  @Get(':id/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Descargar un adjunto del correctivo' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'attachmentId' })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Alternativa a la cabecera',
  })
  downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') header: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.service.streamAttachment(
      this.requireToken(header, token),
      id,
      attachmentId,
      res,
    );
  }

  @Get(':id/documents')
  @ApiOperation({
    summary: 'Documentos del equipo intervenido',
    description:
      'Adjuntos de la ficha del equipo y de los manuales de sus planes ' +
      'preventivos. Lista vacía si el correctivo no tiene equipo.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  getEquipmentDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
  ) {
    return this.service.getEquipmentDocuments(
      this.requireSessionId(sessionId),
      id,
    );
  }

  @Get(':id/documents/:source/:attachmentId/download')
  @ApiOperation({ summary: 'Descargar un documento del equipo intervenido' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'source', description: '`asset` o `manual-<id>`' })
  @ApiParam({ name: 'attachmentId' })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Alternativa a la cabecera',
  })
  downloadEquipmentDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('source') source: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') header: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    return this.service.streamEquipmentDocument(
      this.requireToken(header, token),
      id,
      source,
      attachmentId,
      res,
    );
  }

  @Get(':id/history')
  @ApiOperation({
    summary: 'Correctivos y preventivos ya cerrados sobre el mismo equipo',
    description: 'Lista vacía si el correctivo no tiene equipo.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  getEquipmentHistory(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') sessionId: string,
    @Query() query: GetHistoryQueryDto,
  ) {
    return this.service.getEquipmentHistory(
      this.requireSessionId(sessionId),
      id,
      query.limit ?? 3,
    );
  }

  private requireSessionId(sessionId?: string): string {
    if (!sessionId) {
      throw new BadRequestException('authorization header is required');
    }

    return sessionId;
  }

  private requireToken(header?: string, token?: string): string {
    const sessionId = header || token;

    if (!sessionId) {
      throw new UnauthorizedException('Session token is required');
    }

    return sessionId;
  }
}
