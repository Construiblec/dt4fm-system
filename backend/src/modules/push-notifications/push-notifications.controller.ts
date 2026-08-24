import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { DeletePushSubscriptionDto } from './dto/delete-push-subscription.dto';
import { PushSubscriptionService } from './push-subscription.service';

@ApiTags('push-notifications')
@Controller('push')
export class PushNotificationsController {
  constructor(
    private readonly subscriptionService: PushSubscriptionService,
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
