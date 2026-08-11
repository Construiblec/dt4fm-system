import { Controller, Get, Headers, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BuildingsService } from './buildings.service';

@ApiTags('Edificios')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener lista de edificios de OpenMAINT' })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de edificios obtenida con éxito',
  })
  @ApiResponse({
    status: 400,
    description: 'Cabecera de autorización faltante o inválida',
  })
  async getBuildings(@Headers('authorization') sessionId: string) {
    return this.buildingsService.getBuildings(sessionId);
  }

  @Get(':buildingId/locations')
  @ApiOperation({
    summary:
      'Obtener las plantas de un edificio con sus unidades y áreas comunes',
  })
  @ApiParam({
    name: 'buildingId',
    description: 'ID del edificio en OpenMAINT',
    example: 3025058,
  })
  @ApiHeader({
    name: 'authorization',
    description: 'Token de sesión de OpenMAINT',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Plantas y áreas obtenidas con éxito',
  })
  @ApiResponse({
    status: 401,
    description: 'Sesión de OpenMAINT inválida o expirada',
  })
  @ApiResponse({ status: 502, description: 'Error al consultar OpenMAINT' })
  async getBuildingLocations(
    @Param('buildingId', ParseIntPipe) buildingId: number,
    @Headers('authorization') sessionId: string,
  ) {
    return this.buildingsService.getBuildingLocations(buildingId, sessionId);
  }
}
