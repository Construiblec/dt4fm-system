import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/database.config';
import { OpenmaintModule } from './integrations/openmaint/openmaint.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { IotAlarmsModule } from './modules/iot-alarms/iot-alarms.module';
import { AuthModule } from './modules/auth/auth.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { CleaningTasksModule } from './modules/cleaning-tasks/cleaning-tasks.module';
import { BillingModule } from './modules/billing/billing.module';
import { HealthModule } from './modules/health/health.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OwnersModule } from './modules/owners/owners.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MeetingRemindersModule } from './modules/meeting-reminders/meeting-reminders.module';
import { PreventiveMaintenanceModule } from './modules/preventive-maintenance/preventive-maintenance.module';
import { MaintenanceSupervisionModule } from './modules/maintenance-supervision/maintenance-supervision.module';
import { PasswordRecoveryModule } from './modules/password-recovery/password-recovery.module';
import { PushNotificationsModule } from './modules/push-notifications/push-notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    ScheduleModule.forRoot(),
    OpenmaintModule,
    AuthModule,
    PasswordRecoveryModule,
    IncidentsModule,
    IotAlarmsModule,
    PreventiveMaintenanceModule,
    MaintenanceSupervisionModule,
    BuildingsModule,
    CleaningTasksModule,
    BillingModule,
    HealthModule,
    PaymentsModule,
    OwnersModule,
    NotificationsModule,
    MeetingRemindersModule,
    PushNotificationsModule,
  ],
})
export class AppModule {}
