import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetMyPreventiveMaintenancesQueryDto } from './dto/get-my-preventive-maintenances-query.dto';
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
