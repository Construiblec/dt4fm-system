import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';

@Module({
  imports: [OpenmaintModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
