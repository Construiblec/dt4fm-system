import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PaymentsSchedulerService } from './payments-scheduler.service';

@ApiTags('Pagos')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentsSchedulerService: PaymentsSchedulerService,
  ) {}

  /**
   * POST /payments/generate
   * Disparo manual de la generacion de pagos mensuales.
   * Body opcional: { periodo: "2026-05" } — si no se pasa usa el mes actual.
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generar manualmente los pagos mensuales' })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          description: 'Periodo de facturación (YYYY-MM). Si se omite, se usa el mes actual.',
          example: '2026-06',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen del resultado del proceso de generación de pagos.',
    schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', example: '2026-06' },
        total: { type: 'integer', example: 15 },
        created: { type: 'integer', example: 13 },
        skipped: { type: 'integer', example: 2 },
        failed: { type: 'integer', example: 0 },
        errors: { type: 'array', items: { type: 'string' } },
        skippedReason: { type: 'string', example: 'Hoy no coincide con el DiaEmision' },
      },
    },
  })
  async generatePayments(@Body() body?: { periodo?: string }) {
    const now = new Date();
    const periodo =
      body?.periodo ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    this.logger.log(
      `[PaymentsController] Disparo manual para periodo: ${periodo}`,
    );

    return this.paymentsService.generateMonthlyPayments(periodo);
  }
}
