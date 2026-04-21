import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenmaintModule } from './integrations/openmaint/openmaint.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { CleaningTasksModule } from './modules/cleaning-tasks/cleaning-tasks.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    OpenmaintModule,
    AuthModule,
    IncidentsModule,
    BuildingsModule,
    CleaningTasksModule,
    BillingModule,
  ],
})
export class AppModule {}
