import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import { isMaintenanceSupervisorRole } from './constants/supervision-roles.constants';
import { AssignAssigneeDto } from './dto/assign-assignee.dto';
import { ListMaintenancesQueryDto } from './dto/list-maintenances-query.dto';
import { RejectMaintenanceDto } from './dto/reject-maintenance.dto';
import { ReviewMaintenanceDto } from './dto/review-maintenance.dto';
import { UpdatePlannedStartDto } from './dto/update-planned-start.dto';
import { MaintenanceSupervisionService } from './maintenance-supervision.service';

@ApiTags('Supervisión de mantenimiento')
@ApiHeader({
  name: 'authorization',
  description: 'Token de sesión de OpenMAINT',
  required: true,
})
@Controller('maintenance-supervision')
export class MaintenanceSupervisionController {
  constructor(
    private readonly service: MaintenanceSupervisionService,
    private readonly sessionRoleService: SessionRoleService,
  ) {}

  // ── Listados ───────────────────────────────────────────────────────────────

  @Get('corrective')
  @ApiOperation({
    summary: 'Listar todos los correctivos (sin filtrar por cesionario)',
  })
  @ApiResponse({ status: 200, description: 'Listado obtenido con éxito' })
  @ApiResponse({ status: 403, description: 'Rol no autorizado' })
  async listCorrective(
    @Headers('authorization') sessionId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListMaintenancesQueryDto,
  ) {
    await this.authorize(sessionId);
    return this.service.listCorrective(sessionId, query);
  }

  @Get('preventive')
  @ApiOperation({
    summary: 'Listar todos los preventivos (sin filtrar por cesionario)',
    description:
      'Admite rango de fechas con `from`/`to`, que filtran por inicio ' +
      'previsto (`ExpExecStartDate`) y son **inclusivos** en ambos extremos.',
  })
  @ApiResponse({ status: 200, description: 'Listado obtenido con éxito' })
  @ApiResponse({ status: 400, description: 'Rango de fechas inválido' })
  @ApiResponse({ status: 403, description: 'Rol no autorizado' })
  async listPreventive(
    @Headers('authorization') sessionId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListMaintenancesQueryDto,
  ) {
    await this.authorize(sessionId);
    return this.service.listPreventive(sessionId, query);
  }

  @Get('assignees')
  @ApiOperation({
    summary: 'Empleados candidatos a cesionario, opcionalmente por equipo',
  })
  @ApiQuery({
    name: 'teamId',
    required: false,
    description: 'Acota los candidatos a un equipo de trabajo',
  })
  @ApiResponse({ status: 200, description: 'Candidatos obtenidos con éxito' })
  async listAssignees(
    @Headers('authorization') sessionId: string,
    @Query('teamId') teamId?: string,
  ) {
    await this.authorize(sessionId);
    return this.service.listAssignees(sessionId, this.parseOptionalId(teamId));
  }

  @Get(':kind/:id')
  @ApiOperation({
    summary: 'Detalle de un mantenimiento, en solo lectura',
    description:
      'No reutiliza GET /preventive-maintenance/:id porque la vista del ' +
      'técnico dispara POST /:id/start al montar, y eso avanza el flujo.',
  })
  @ApiParam({ name: 'kind', enum: ['corrective', 'preventive'] })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Detalle obtenido con éxito' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  async getDetail(
    @Headers('authorization') sessionId: string,
    @Param('kind') kind: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.authorize(sessionId);
    return this.service.getDetail(sessionId, this.parseKind(kind), id);
  }

  @Get(':kind/:id/attachments')
  @ApiOperation({
    summary: 'Fotos de evidencia de un mantenimiento',
    description:
      'Devuelve las imágenes ya resueltas a base64 desde la vista previa de ' +
      'OpenMAINT, así el navegador las pinta sin un endpoint de descarga. Los ' +
      'adjuntos que no son imagen o no ofrecen vista previa se omiten.',
  })
  @ApiParam({ name: 'kind', enum: ['corrective', 'preventive'] })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Evidencia obtenida con éxito' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  async getEvidence(
    @Headers('authorization') sessionId: string,
    @Param('kind') kind: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.authorize(sessionId);
    return this.service.getEvidence(sessionId, this.parseKind(kind), id);
  }

  // ── Asignación ─────────────────────────────────────────────────────────────

  @Post('corrective/:id/assign')
  @ApiOperation({
    summary: 'Asignar cesionario y equipo a un correctivo',
    description:
      'Requiere inicio previsto: o viene en `plannedStart`, o el correctivo ' +
      'ya lo tiene. `ExpExecStartDate` solo es escribible en CM02, así que un ' +
      'correctivo asignado sin fecha se queda sin planificar para siempre.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 201, description: 'Correctivo asignado' })
  @ApiResponse({ status: 400, description: 'Falta el inicio previsto' })
  @ApiResponse({
    status: 409,
    description: 'El correctivo no está en asignación',
  })
  @ApiResponse({ status: 502, description: 'OpenMAINT no aplicó el avance' })
  async assignCorrective(
    @Headers('authorization') sessionId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: AssignAssigneeDto,
  ) {
    await this.authorize(sessionId);
    return this.service.assignCorrective(sessionId, id, dto);
  }

  @Post('corrective/:id/reject')
  @ApiOperation({ summary: 'Rechazar y cerrar un correctivo sin ejecutarlo' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 201, description: 'Correctivo rechazado y cerrado' })
  async rejectCorrective(
    @Headers('authorization') sessionId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: RejectMaintenanceDto,
  ) {
    await this.authorize(sessionId);
    return this.service.rejectCorrective(sessionId, id, dto);
  }

  @Post('preventive/:id/assign')
  @ApiOperation({
    summary: 'Asignar cesionario a un preventivo planificado',
    description:
      'El equipo NO se puede fijar: `Team` no es escribible en ningún paso ' +
      'de PreventiveMaint. Si se envía `teamId` se ignora.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 201, description: 'Preventivo asignado' })
  async assignPreventive(
    @Headers('authorization') sessionId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: AssignAssigneeDto,
  ) {
    await this.authorize(sessionId);
    return this.service.assignPreventive(sessionId, id, dto);
  }

  @Post('preventive/:id/resume')
  @ApiOperation({
    summary: 'Reanudar un preventivo suspendido',
    description:
      '`PM04-Advance`: Suspensión → Ejecución. OpenMAINT limpia el motivo de ' +
      'suspensión por su cuenta. Es la única salida del paso PM04, junto con ' +
      'cambiar el cesionario.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 201, description: 'Preventivo reanudado' })
  @ApiResponse({ status: 409, description: 'El preventivo no está suspendido' })
  @ApiResponse({ status: 502, description: 'OpenMAINT no aplicó el avance' })
  async resumePreventive(
    @Headers('authorization') sessionId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.authorize(sessionId);
    return this.service.resumePreventive(sessionId, id);
  }

  @Put(':kind/:id/assignee')
  @ApiOperation({
    summary: 'Cambiar el cesionario, y el equipo donde el paso lo permita',
    description:
      'No mueve el flujo. `teamId` es opcional y solo se aplica en los pasos ' +
      'que declaran `Team` escribible — en correctivo, `CM02-Assignment` y ' +
      '`CM07-Management`; fuera de ahí se ignora y se registra en el log. El ' +
      'cesionario se valida contra el equipo de destino. Rechaza con 409 si el ' +
      'trabajo lo atiende un proveedor o si la persona no es de ese equipo.',
  })
  @ApiParam({ name: 'kind', enum: ['corrective', 'preventive'] })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Cesionario actualizado' })
  @ApiResponse({ status: 409, description: 'Proveedor o equipo distinto' })
  async updateAssignee(
    @Headers('authorization') sessionId: string,
    @Param('kind') kind: string,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: AssignAssigneeDto,
  ) {
    await this.authorize(sessionId);
    return this.service.updateAssignee(
      sessionId,
      this.parseKind(kind),
      id,
      dto.assigneeId,
      dto.teamId,
    );
  }

  // ── Revisión de cierre ─────────────────────────────────────────────────────

  @Post('corrective/:id/review')
  @ApiOperation({
    summary: 'Aprobar o devolver un correctivo pendiente de revisión',
    description:
      'Actúa sobre el paso CM05-Accounting. No existe equivalente en ' +
      'preventivos: PM03-Advance cierra el proceso y un proceso cerrado ya ' +
      'no admite acciones.',
  })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 201, description: 'Revisión registrada' })
  @ApiResponse({ status: 400, description: 'Falta el motivo al rechazar' })
  @ApiResponse({ status: 409, description: 'No está pendiente de revisión' })
  async reviewCorrective(
    @Headers('authorization') sessionId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ReviewMaintenanceDto,
  ) {
    await this.authorize(sessionId);
    return this.service.reviewCorrective(sessionId, id, dto);
  }

  // ── Fecha prevista ─────────────────────────────────────────────────────────

  @Put(':kind/:id/planned-start')
  @ApiOperation({
    summary: 'Fijar la fecha prevista de inicio de ejecución',
    description: 'Solo en el paso de asignación (CM02 / PM02).',
  })
  @ApiParam({ name: 'kind', enum: ['corrective', 'preventive'] })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiResponse({ status: 200, description: 'Fecha prevista guardada' })
  @ApiResponse({ status: 409, description: 'El paso no admite el atributo' })
  async updatePlannedStart(
    @Headers('authorization') sessionId: string,
    @Param('kind') kind: string,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdatePlannedStartDto,
  ) {
    await this.authorize(sessionId);
    return this.service.updatePlannedStart(
      sessionId,
      this.parseKind(kind),
      id,
      dto.plannedStart,
    );
  }

  // ── Guardas ────────────────────────────────────────────────────────────────

  /**
   * El rol ya no llega en `x-role` (BP-003): se resuelve contra la sesión
   * real de openMAINT, así que nadie puede declararse supervisor desde el
   * cliente. La barrera de fondo sigue siendo la misma: los permisos de
   * grupo de la sesión en OpenMAINT.
   */
  private async authorize(sessionId: string): Promise<void> {
    if (!sessionId?.trim()) {
      throw new UnauthorizedException('Falta el token de sesión de OpenMAINT');
    }

    const role = await this.sessionRoleService.resolveRole(sessionId);

    if (!isMaintenanceSupervisorRole(role ?? undefined)) {
      throw new ForbiddenException(
        'El rol no tiene acceso a la supervisión de mantenimiento',
      );
    }
  }

  private parseKind(kind: string): 'corrective' | 'preventive' {
    if (kind !== 'corrective' && kind !== 'preventive') {
      throw new BadRequestException(
        'El tipo debe ser "corrective" o "preventive"',
      );
    }

    return kind;
  }

  private parseOptionalId(value?: string): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('teamId debe ser un entero positivo');
    }

    return parsed;
  }
}
