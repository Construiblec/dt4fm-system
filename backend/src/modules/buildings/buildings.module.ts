import { Module } from '@nestjs/common'
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module'
import { BuildingsController } from './buildings.controller'
import { BuildingsService } from './buildings.service'

@Module({
  imports: [OpenmaintModule],
  controllers: [BuildingsController],
  providers: [BuildingsService]
})
export class BuildingsModule {}
