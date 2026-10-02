import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { CameraCatalogService } from './camera-catalog.service';
import { CamerasController } from './cameras.controller';
import { LiveViewRequest } from './entities/live-view-request.entity';
import { LiveSessionService } from './live-session.service';
import { VideoViewsService } from './video-views.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LiveViewRequest]),
    AccessControlModule,
    OpenmaintModule,
  ],
  controllers: [CamerasController],
  providers: [CameraCatalogService, LiveSessionService, VideoViewsService],
})
export class VideoSurveillanceModule {}
