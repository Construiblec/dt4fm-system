import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';

@Module({
  imports: [OpenmaintModule],
  controllers: [OwnersController],
  providers: [OwnersService],
})
export class OwnersModule {}
