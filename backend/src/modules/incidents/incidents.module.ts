import { Module } from '@nestjs/common'
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module'
import { IncidentsController } from './incidents.controller'
import { IncidentsService } from './incidents.service'

@Module({
  imports: [OpenmaintModule],
  controllers: [IncidentsController],
  providers: [IncidentsService]
})
export class IncidentsModule {}
