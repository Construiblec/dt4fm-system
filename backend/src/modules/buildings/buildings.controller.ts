import { Controller, Get, Headers } from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { BuildingsService } from './buildings.service'

@ApiTags('Edificios')
@Controller('buildings')
export class BuildingsController {

  constructor(
    private readonly buildingsService: BuildingsService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener lista de edificios de OpenMAINT' })
  @ApiHeader({ name: 'authorization', description: 'Token de sesión de OpenMAINT', required: true })
  @ApiResponse({ status: 200, description: 'Lista de edificios obtenida con éxito' })
  @ApiResponse({ status: 400, description: 'Cabecera de autorización faltante o inválida' })
  async getBuildings(@Headers('authorization') sessionId: string) {
    return this.buildingsService.getBuildings(sessionId)
  }

}
