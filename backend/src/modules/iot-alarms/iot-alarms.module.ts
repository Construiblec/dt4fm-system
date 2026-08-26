import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { IotAlarmOpenmaintService } from './iot-alarm.openmaint.service';
import { IotAlarmsController } from './iot-alarms.controller';
import { IotAlarmsService } from './iot-alarms.service';

@Module({
  imports: [OpenmaintModule, PushNotificationsModule],
  controllers: [IotAlarmsController],
  providers: [IotAlarmsService, IotAlarmOpenmaintService],
})
export class IotAlarmsModule {}
