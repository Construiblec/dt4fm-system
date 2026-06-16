import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenmaintModule } from './integrations/openmaint/openmaint.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { CleaningTasksModule } from './modules/cleaning-tasks/cleaning-tasks.module';
import { BillingModule } from './modules/billing/billing.module';
import { HealthModule } from './modules/health/health.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OwnersModule } from './modules/owners/owners.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MeetingRemindersModule } from './modules/meeting-reminders/meeting-reminders.module';

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
    HealthModule,
    PaymentsModule,
    OwnersModule,
    NotificationsModule,
    MeetingRemindersModule,
  ],
})
export class AppModule {}
