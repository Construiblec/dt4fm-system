import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { DeletePushSubscriptionDto } from './dto/delete-push-subscription.dto';
import { NotificationHistoryService } from './notification-history.service';
import { PushSubscriptionService } from './push-subscription.service';

@ApiTags('push-notifications')
@Controller('push')
export class PushNotificationsController {
  constructor(
    private readonly subscriptionService: PushSubscriptionService,
    private readonly historyService: NotificationHistoryService,
  ) {}

  @Get('vapid-public-key')
  @ApiOperation({
    summary: 'Clave pública VAPID con la que el navegador se suscribe',
  })
  getVapidPublicKey() {
    return { publicKey: this.subscriptionService.getVapidPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Registra la suscripción push del dispositivo',
    description:
      'La identidad y TODOS los roles del usuario se resuelven de la sesión ' +
      'de openMAINT; el header x-role no interviene. El alta es un upsert ' +
      'sobre el endpoint: en dispositivos compartidos reasigna la suscripción ' +
      'al usuario que acaba de iniciar sesión.',
  })
  @ApiResponse({ status: 204, description: 'Suscripción registrada' })
  @ApiResponse({ status: 401, description: 'Sesión de openMAINT no válida' })
  async subscribe(
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
    @Body() dto: CreatePushSubscriptionDto,
  ): Promise<void> {
    await this.subscriptionService.subscribe(
      this.requireSessionId(authorization, sessionToken),
      dto,
    );
  }

  @Delete('subscribe')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Da de baja la suscripción; se llama al cerrar sesión',
  })
  async unsubscribe(@Body() dto: DeletePushSubscriptionDto): Promise<void> {
    await this.subscriptionService.unsubscribe(dto.endpoint);
  }

  // ─── Historial ─────────────────────────────────────────────────────────────────────

  @Get('notifications')
  @ApiOperation({
    summary: 'Historial de notificaciones del usuario de la sesión',
    description:
      'Devuelve las más recientes primero, junto al número de no leídas. ' +
      '`before` pagina por fecha: se pasa el `createdAt` del último elemento ' +
      'ya recibido.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 30 })
  @ApiQuery({
    name: 'before',
    required: false,
    example: '2026-08-25T10:52:55Z',
  })
  @ApiResponse({ status: 200, description: 'Historial del usuario' })
  @ApiResponse({ status: 401, description: 'Sesión de openMAINT no válida' })
  async listNotifications(
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.historyService.list(
      this.requireSessionId(authorization, sessionToken),
      { limit: limit ? Number(limit) : undefined, before },
    );
  }

  @Get('notifications/unread-count')
  @ApiOperation({
    summary: 'Número de notificaciones sin leer, para la campana',
  })
  async countUnread(
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.historyService.countUnread(
      this.requireSessionId(authorization, sessionToken),
    );
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca como leídas todas las del usuario' })
  async markAllRead(
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    return this.historyService.markAllRead(
      this.requireSessionId(authorization, sessionToken),
    );
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marca una como leída',
    description:
      'Idempotente: repetirlo, o pedirlo sobre una notificación ajena, ' +
      'devuelve el contador sin error.',
  })
  async markRead(
    @Headers('authorization') authorization: string,
    @Headers('x-session-token') sessionToken: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.historyService.markRead(
      this.requireSessionId(authorization, sessionToken),
      id,
    );
  }

  /** Los módulos del frontend mandan la sesión con dos nombres distintos. */
  private requireSessionId(
    authorization?: string,
    sessionToken?: string,
  ): string {
    const sessionId = authorization || sessionToken;

    if (!sessionId) {
      throw new UnauthorizedException('Falta la sesión de openMAINT');
    }

    return sessionId;
  }
}
