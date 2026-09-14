import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { GuestLinkModule } from '../guest-link/guest-link.module';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { GuestPortalController } from './guest-portal.controller';
import { GuestPortalService } from './guest-portal.service';

@Module({
  // De `AccessControlModule` solo se consume `GuestPortalDataService`: este
  // módulo nunca ve `CredentialService`, y con ello tampoco `revealPin()`.
  //
  // El token y la entrega viven en `GuestLinkModule`, que también importa
  // `access-control`: por eso no pueden estar aquí sin crear un ciclo.
  imports: [AccessControlModule, GuestLinkModule, OpenmaintModule],
  controllers: [GuestPortalController],
  providers: [
    GuestPortalService,
    // Se provee aquí en vez de importarlo de `PasswordRecoveryModule`: los
    // contadores viven en memoria dentro de la instancia, así que cada módulo
    // quiere el suyo y no compartir cubetas con la recuperación de contraseña.
    RateLimiterService,
  ],
  exports: [GuestPortalService],
})
export class GuestPortalModule {}
