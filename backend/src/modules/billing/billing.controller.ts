import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';

@ApiTags('Facturación')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * POST /billing/run
   * Disparo manual del proceso de facturacion diaria.
   * Body opcional: { date: "2026-04-23" } — si no se pasa usa la fecha de hoy.
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar manualmente el proceso de facturación diaria',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description:
            'Fecha a facturar (YYYY-MM-DD). Por defecto se utiliza la fecha actual.',
          example: '2026-06-03',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado del proceso de facturación.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        date: { type: 'string', example: '2026-06-03' },
        processed: { type: 'integer', example: 4 },
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async runBilling(@Body() body?: { date?: string }) {
    const date = body?.date ?? new Date().toISOString().split('T')[0];
    this.logger.log(`[BillingController] Disparo manual para fecha: ${date}`);
    return this.billingService.runDailyBilling(date);
  }
}
