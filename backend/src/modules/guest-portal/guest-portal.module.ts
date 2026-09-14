import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { GuestPortalController } from './guest-portal.controller';
import { GuestPortalService } from './guest-portal.service';
import { GuestTokenService } from './guest-token.service';

@Module({
  // De `AccessControlModule` solo se consume `GuestPortalDataService`: este
  // módulo nunca ve `CredentialService`, y con ello tampoco `revealPin()`.
  imports: [AccessControlModule, OpenmaintModule],
  controllers: [GuestPortalController],
  providers: [
    GuestPortalService,
    GuestTokenService,
    // Se provee aquí en vez de importarlo de `PasswordRecoveryModule`: los
    // contadores viven en memoria dentro de la instancia, así que cada módulo
    // quiere el suyo y no compartir cubetas con la recuperación de contraseña.
    RateLimiterService,
  ],
  // Sale del módulo para que el envío automático del correo —cuando exista—
  // pueda pedir el enlace sin pasar por HTTP.
  exports: [GuestPortalService],
})
export class GuestPortalModule {}
