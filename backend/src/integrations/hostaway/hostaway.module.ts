import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HostawayService } from './hostaway.service';

@Module({
  imports: [HttpModule],
  providers: [HostawayService],
  exports: [HostawayService],
})
export class HostawayModule {}
