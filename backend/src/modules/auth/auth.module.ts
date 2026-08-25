import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';

@Module({
  imports: [OpenmaintModule],
  controllers: [AuthController],
  providers: [AuthService],
  // OwnersService lo reutiliza para que `/owners/login` sea un alias del login
  // unificado en vez de una segunda implementación que se desincronice.
  exports: [AuthService],
})
export class AuthModule {}
