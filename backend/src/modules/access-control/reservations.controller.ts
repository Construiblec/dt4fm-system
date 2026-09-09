import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { HostawayWebhookDto } from './dto/hostaway-webhook.dto';
import { GuestStayService } from './guest-stay.service';
import { HostawayWebhookGuard } from './guards/hostaway-webhook.guard';

@ApiTags('Control de accesos')
@ApiSecurity('x-hostaway-secret')
@Controller('webhooks')
@UseGuards(HostawayWebhookGuard)
export class ReservationsController {
  private readonly logger = new Logger(ReservationsController.name);

  constructor(private readonly guestStayService: GuestStayService) {}

  @Post('hostaway')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recibir una reserva creada, modificada o cancelada',
    description:
      'Responde 200 siempre: el trabajo va en segundo plano y un fallo de accesos no puede romper nada aguas arriba. Lo que se pierda lo recoge el barrido diario.',
  })
  @ApiResponse({ status: 200, description: 'Recibido.' })
  @ApiResponse({ status: 401, description: 'Secreto de webhook inválido.' })
  @ApiResponse({ status: 503, description: 'Webhook sin configurar.' })
  receive(@Body() dto: HostawayWebhookDto) {
    const reservationId = String(
      dto.data.reservationId ?? dto.data.id ?? '',
    ).trim();

    if (!reservationId || !dto.data.arrivalDate || !dto.data.departureDate) {
      this.logger.warn(
        `Webhook ${dto.action} sin datos suficientes para proyectar la reserva`,
      );
      return { received: true, processed: false };
    }

    // Best-effort: nunca propaga. Hostaway no debe ver un 500 nuestro.
    void this.process(dto, reservationId);

    return { received: true, processed: true };
  }

  private async process(
    dto: HostawayWebhookDto,
    reservationId: string,
  ): Promise<void> {
    try {
      await this.guestStayService.upsertFromReservation({
        hostawayReservationId: reservationId,
        listingId: String(dto.data.listingMapId ?? ''),
        guestName: dto.data.guestName ?? 'Huésped',
        guestEmail: dto.data.guestEmail ?? null,
        arrivalDate: dto.data.arrivalDate!,
        departureDate: dto.data.departureDate!,
        status: dto.data.status,
        issuedBy: 'hostaway-webhook',
      });
    } catch (error) {
      this.logger.error(
        `No se pudo procesar la reserva ${reservationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
