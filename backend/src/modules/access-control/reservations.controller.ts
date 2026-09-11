import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBasicAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  HOSTAWAY_RESERVATION_EVENTS,
  HOSTAWAY_RESERVATION_OBJECT,
  HostawayWebhookDataDto,
  HostawayWebhookDto,
} from './dto/hostaway-webhook.dto';
import { GuestStayService } from './guest-stay.service';
import { HostawayWebhookGuard } from './guards/hostaway-webhook.guard';

interface WebhookAck {
  received: true;
  processed: boolean;
}

const IGNORED: WebhookAck = { received: true, processed: false };

@ApiTags('Control de accesos')
@ApiBasicAuth('hostaway-webhook')
@Controller('webhooks')
@UseGuards(HostawayWebhookGuard)
export class ReservationsController {
  private readonly logger = new Logger(ReservationsController.name);

  constructor(private readonly guestStayService: GuestStayService) {}

  @Post('hostaway')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recibir un evento del unified webhook de Hostaway',
    description:
      'Proyecta `reservation.created` y `reservation.updated`; el resto responde 200 sin efecto. Solo responde 503 cuando un reintento de Hostaway puede resolver el fallo.',
  })
  @ApiResponse({ status: 200, description: 'Recibido.' })
  @ApiResponse({
    status: 401,
    description: 'Credenciales de webhook inválidas.',
  })
  @ApiResponse({
    status: 503,
    description:
      'Webhook sin configurar o fallo transitorio; Hostaway reintenta.',
  })
  async receive(@Body() dto: HostawayWebhookDto): Promise<WebhookAck> {
    // Un 4xx sería un email de alerta al dueño de la cuenta por cada mensaje de huésped.
    if (
      dto.object !== HOSTAWAY_RESERVATION_OBJECT ||
      !HOSTAWAY_RESERVATION_EVENTS.includes(dto.event)
    ) {
      this.logger.debug(`Evento ${dto.object}/${dto.event} ignorado`);
      return IGNORED;
    }

    const data = await this.parseReservation(dto.data);

    if (!data) return IGNORED;

    // `hostawayReservationId` o `id`, nunca `reservationId`: ese es el id del
    // canal y el barrido guarda el interno, así que la misma reserva acabaría
    // con dos credenciales vivas.
    const reservationId = String(
      data.hostawayReservationId ?? data.id ?? '',
    ).trim();

    if (!reservationId || !data.arrivalDate || !data.departureDate) {
      this.logger.warn(
        `Evento ${dto.event} sin datos suficientes para proyectar la reserva`,
      );
      return IGNORED;
    }

    try {
      const stay = await this.guestStayService.upsertFromReservation({
        hostawayReservationId: reservationId,
        listingId: String(data.listingMapId ?? ''),
        guestName: data.guestName ?? 'Huésped',
        guestEmail: data.guestEmail ?? null,
        arrivalDate: data.arrivalDate,
        departureDate: data.departureDate,
        status: data.status,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        issuedBy: 'hostaway-webhook',
        deferSync: true,
      });

      return { received: true, processed: stay !== null };
    } catch (error) {
      // Un 4xx nuestro no se arregla reintentando: solo lo transitorio pide reintento.
      if (error instanceof HttpException && error.getStatus() < 500) {
        this.logger.error(
          `Reserva ${reservationId} descartada: ${error.message}`,
        );
        return IGNORED;
      }

      this.logger.error(
        `No se pudo procesar la reserva ${reservationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException('No se pudo procesar la reserva');
    }
  }

  private async parseReservation(
    raw: Record<string, unknown>,
  ): Promise<HostawayWebhookDataDto | null> {
    const data = plainToInstance(HostawayWebhookDataDto, raw);
    const errors = await validate(data, { whitelist: true });

    if (errors.length > 0) {
      this.logger.error(
        `Reserva con formato inesperado en: ${errors.map((e) => e.property).join(', ')}`,
      );
      return null;
    }

    return data;
  }
}
