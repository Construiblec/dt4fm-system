import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenmaintModule } from './integrations/openmaint/openmaint.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingsModule } from './modules/buildings/buildings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    OpenmaintModule,
    AuthModule,
    IncidentsModule,
    BuildingsModule,
  ],
})
export class AppModule {}
