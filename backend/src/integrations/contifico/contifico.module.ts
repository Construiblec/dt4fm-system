import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ContificoClient } from './contifico.client';
import { ContificoService } from './contifico.service';

@Module({
  imports: [HttpModule],
  providers: [ContificoClient, ContificoService],
  exports: [ContificoClient, ContificoService],
})
export class ContificoModule {}
