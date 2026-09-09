import { Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HostawayModule } from '../../integrations/hostaway/hostaway.module';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { AccessControlController } from './access-control.controller';
import { AccessIotClient } from './access-iot.client';
import { AccessMaintenanceService } from './access-maintenance.service';
import { AccessIotGateway } from './access-iot.gateway';
import { AccessIotMockGateway } from './access-iot.mock';
import { BuildingCatalogService } from './building-catalog.service';
import { CredentialService } from './credential.service';
import { GuestStayService } from './guest-stay.service';
import { ReservationSweepService } from './reservation-sweep.service';
import { ReservationsController } from './reservations.controller';
import { AccessCredential } from './entities/access-credential.entity';
import { GuestStay } from './entities/guest-stay.entity';
import { PinCipherService } from './pin-cipher.service';
import { PinGeneratorService } from './pin-generator.service';
import { SyncRetryService } from './sync-retry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccessCredential, GuestStay]),
    HttpModule,
    OpenmaintModule,
    HostawayModule,
  ],
  controllers: [AccessControlController, ReservationsController],
  providers: [
    PinCipherService,
    PinGeneratorService,
    BuildingCatalogService,
    CredentialService,
    SyncRetryService,
    GuestStayService,
    ReservationSweepService,
    AccessMaintenanceService,
    {
      // Mientras la VPS no exista, ACCESS_IOT_USE_MOCK=true resuelve a la
      // implementación en memoria. Es el mismo recurso que HOSTAWAY_USE_MOCK.
      provide: AccessIotGateway,
      inject: [ConfigService, HttpService],
      useFactory: (configService: ConfigService, httpService: HttpService) =>
        configService.get<string>('ACCESS_IOT_USE_MOCK') === 'true'
          ? new AccessIotMockGateway()
          : new AccessIotClient(httpService, configService),
    },
  ],
  exports: [CredentialService, GuestStayService],
})
export class AccessControlModule {}
