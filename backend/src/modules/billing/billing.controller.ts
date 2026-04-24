import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * POST /billing/run
   * Disparo manual del proceso de facturacion diaria.
   * Body opcional: { date: "2026-04-23" } — si no se pasa usa la fecha de hoy.
   *
   * El webhook /webhooks/hostaway fue desactivado.
   * La facturacion ahora corre via scheduler a las 23:50 diariamente.
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  async runBilling(@Body() body?: { date?: string }) {
    const date = body?.date ?? new Date().toISOString().split('T')[0];
    this.logger.log(`[BillingController] Disparo manual para fecha: ${date}`);
    return this.billingService.runDailyBilling(date);
  }
}
