import { Controller, Get, Headers } from '@nestjs/common'
import { BuildingsService } from './buildings.service'

@Controller('buildings')
export class BuildingsController {

  constructor(
    private readonly buildingsService: BuildingsService
  ) {}

  @Get()
  async getBuildings(@Headers('authorization') sessionId: string) {
    return this.buildingsService.getBuildings(sessionId)
  }

}
