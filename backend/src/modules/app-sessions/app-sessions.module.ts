import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { AppSessionsService } from './app-sessions.service';
import { AppSession } from './entities/app-session.entity';

/**
 * Registro de las sesiones que emite el login. Lo usan el login y el cierre de
 * sesión (auth) y los tres caminos que cambian una contraseña: el de la app,
 * el de residentes y la recuperación por correo.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppSession]), OpenmaintModule],
  providers: [AppSessionsService],
  exports: [AppSessionsService],
})
export class AppSessionsModule {}
