import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsSchedulerService } from './payments-scheduler.service';

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
