import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { CleaningSupervisionsService } from './cleaning-supervisions.service';
import {
  AssignCorrectorDto,
  CreateFindingDto,
  OpenSupervisionDto,
  UpdateFindingDto,
} from './dto/cleaning-supervision.dto';
import type { UploadedFile as UploadedPhoto } from './utils/photo-upload.util';

const SESSION_HEADER = {
  name: 'x-session-token',
  description: 'Token de sesión de openMAINT',
  required: true,
};

/**
 * Supervisión posterior de limpieza. El rol y el empleado se resuelven en el
 * servicio desde la sesión; aquí solo se exige que llegue el token.
 *
 * Las rutas fijas (`template`, `mine`) van antes de `:id`.
 */
@ApiTags('Supervisión de limpieza')
@Controller('cleaning-supervisions')
export class CleaningSupervisionsController {
  constructor(private readonly service: CleaningSupervisionsService) {}

  @Get('template')
  @ApiOperation({
    summary: 'Áreas y puntos del checklist de supervisión (SupervisorLimpieza)',
  })
  @ApiHeader(SESSION_HEADER)
  async getTemplate(@Headers('x-session-token') sessionToken: string) {
    return this.service.getTemplate(this.token(sessionToken));
  }

  @Get('mine')
  @ApiOperation({
    summary:
      'Supervisiones en corrección asignadas al operario conectado (Correcciones)',
  })
  @ApiHeader(SESSION_HEADER)
  async mine(@Headers('x-session-token') sessionToken: string) {
    return this.service.mine(this.token(sessionToken));
  }

  @Post()
  @ApiOperation({
    summary:
      'Devuelve la supervisión abierta de una limpieza o recupera su borrador (SupervisorLimpieza)',
  })
  @ApiHeader(SESSION_HEADER)
  @ApiResponse({
    status: 409,
    description:
      'La limpieza no se supervisa: reason = legacy | superseded | disabled | reviewed',
  })
  async open(
    @Body(new ValidationPipe({ transform: true })) dto: OpenSupervisionDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.openForTask(dto.taskId, this.token(sessionToken));
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Detalle con novedades y fotos (SupervisorLimpieza, coordinación o el Corrector en InCorrection)',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async detail(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.getDetail(id, this.token(sessionToken));
  }

  @Post(':id/start')
  @ApiOperation({
    summary: 'Iniciar: asigna como Supervisor al usuario conectado',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async start(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.start(id, this.token(sessionToken));
  }

  @Post(':id/findings')
  @ApiOperation({ summary: 'Registrar una novedad (solo en Draft)' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async addFinding(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true })) dto: CreateFindingDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.addFinding(id, dto, this.token(sessionToken));
  }

  @Patch(':id/findings/:findingId')
  @ApiOperation({ summary: 'Editar una novedad (solo en Draft)' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'findingId', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async updateFinding(
    @Param('id', ParseIntPipe) id: number,
    @Param('findingId', ParseIntPipe) findingId: number,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateFindingDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.updateFinding(
      id,
      findingId,
      dto,
      this.token(sessionToken),
    );
  }

  @Delete(':id/findings/:findingId')
  @ApiOperation({ summary: 'Eliminar una novedad y sus fotos (solo en Draft)' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'findingId', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async deleteFinding(
    @Param('id', ParseIntPipe) id: number,
    @Param('findingId', ParseIntPipe) findingId: number,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.deleteFinding(id, findingId, this.token(sessionToken));
  }

  @Post(':id/findings/:findingId/photos')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Adjuntar una foto a la novedad (máximo 2)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'findingId', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('findingId', ParseIntPipe) findingId: number,
    @UploadedFile() file: UploadedPhoto | undefined,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const token = this.token(sessionToken);
    if (!file) throw new BadRequestException('File is required');
    return this.service.uploadPhoto(id, findingId, file, token);
  }

  @Delete(':id/findings/:findingId/photos/:attachmentId')
  @ApiOperation({ summary: 'Borrar una foto de la novedad (solo en Draft)' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'findingId', type: 'integer' })
  @ApiParam({ name: 'attachmentId', type: 'string' })
  @ApiHeader(SESSION_HEADER)
  async deletePhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('findingId', ParseIntPipe) findingId: number,
    @Param('attachmentId') attachmentId: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.deletePhoto(
      id,
      findingId,
      attachmentId,
      this.token(sessionToken),
    );
  }

  @Get(':id/findings/:findingId/attachments/:attachmentId/download')
  @ApiOperation({
    summary: 'Descargar una foto de una novedad (con pertenencia verificada)',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiParam({ name: 'findingId', type: 'integer' })
  @ApiParam({ name: 'attachmentId', type: 'string' })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Token de sesión por query (para etiquetas img)',
  })
  @ApiHeader({ ...SESSION_HEADER, required: false })
  async downloadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('findingId', ParseIntPipe) findingId: number,
    @Param('attachmentId') attachmentId: string,
    @Query('token') tokenFromQuery: string | undefined,
    @Headers('x-session-token') tokenFromHeader: string | undefined,
    @Res() res: Response,
  ) {
    const { data, contentType, fileName } = await this.service.downloadPhoto(
      id,
      findingId,
      attachmentId,
      this.token(tokenFromHeader ?? tokenFromQuery),
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }

  @Post(':id/assign')
  @ApiOperation({
    summary:
      'Asignar o reasignar las correcciones a un operario del equipo (InCorrection)',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async assign(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true })) dto: AssignCorrectorDto,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.assign(id, dto, this.token(sessionToken));
  }

  @Post(':id/fixed')
  @ApiOperation({
    summary: '«Resuelto»: el Corrector marca las correcciones (Fixed)',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async fixed(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.markFixed(id, this.token(sessionToken));
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirmar arreglos (Confirmed)' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async confirm(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.confirm(id, this.token(sessionToken));
  }

  @Post(':id/approve')
  @ApiOperation({
    summary:
      'Aprobar la unidad: limpieza a Reviewed y supervisión a Approved (reintentable)',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiHeader(SESSION_HEADER)
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.service.approve(id, this.token(sessionToken));
  }

  private token(value: string | undefined): string {
    if (!value) throw new UnauthorizedException('Session token is required');
    return value;
  }
}
