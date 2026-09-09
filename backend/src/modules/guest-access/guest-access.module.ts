import { Module } from '@nestjs/common';
import { HostawayModule } from '../../integrations/hostaway/hostaway.module';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { GuestAccessController } from './guest-access.controller';
import { GuestAccessService } from './guest-access.service';
import { GuestTokenService } from './guest-token.service';

@Module({
  imports: [HostawayModule],
  controllers: [GuestAccessController],
  providers: [
    GuestAccessService,
    GuestTokenService,
    // Se provee aquí en vez de importarlo de `PasswordRecoveryModule`: los
    // contadores viven en memoria dentro de la instancia, así que cada módulo
    // quiere el suyo y no compartir cubetas con la recuperación de contraseña.
    RateLimiterService,
  ],
  // `GuestAccessService` sale del módulo para que el envío del correo —cuando
  // exista— pueda pedir el enlace sin pasar por HTTP.
  exports: [GuestAccessService],
})
export class GuestAccessModule {}
