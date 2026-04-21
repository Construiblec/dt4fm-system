import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { HostawayWebhookDto } from './dto/hostaway-webhook.dto';

@Controller('webhooks')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * POST /webhooks/hostaway
   * Hostaway llama a este endpoint cuando se crea o actualiza una reservación.
   * Devuelve 200 siempre que recibe el payload para evitar reintentos innecesarios.
   */
  @Post('hostaway')
  @HttpCode(HttpStatus.OK)
  async handleHostawayWebhook(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: HostawayWebhookDto,
  ) {
    this.logger.log(`[Webhook] Hostaway → action: ${dto.action}`);
    return this.billingService.handleReservationWebhook(dto);
  }
}
