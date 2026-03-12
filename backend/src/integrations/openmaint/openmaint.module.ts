import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { OpenmaintClient } from './openmaint.client'
import { OpenmaintService } from './openmaint.service'
import { OpenmaintAuthService } from './openmaint.auth.service'

@Module({
  imports: [HttpModule],
  providers: [
    OpenmaintClient,
    OpenmaintService,
    OpenmaintAuthService
  ],
  exports: [
    OpenmaintService,
    OpenmaintAuthService
  ]
})
export class OpenmaintModule {}