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
import { PaymentReminderService } from './payment-reminder.service';
import { OverdueNoticeService } from './overdue-notice.service';

@ApiTags('Pagos')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentsSchedulerService: PaymentsSchedulerService,
    private readonly reminderService: PaymentReminderService,
    private readonly overdueNoticeService: OverdueNoticeService,
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
          description:
            'Periodo de facturación (YYYY-MM). Si se omite, se usa el mes actual.',
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
        skippedReason: {
          type: 'string',
          example: 'Hoy no coincide con el DiaEmision',
        },
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

  /**
   * POST /payments/reminders
   * Disparo manual del envío de recordatorios de vencimiento.
   * Body opcional:
   *   - periodo: "2026-06" — si no se pasa usa el mes actual.
   *   - force: true — saltea la validación de fecha (DiaVencimiento − 1)
   *     para poder probar el envío cualquier día.
   */
  @Post('reminders')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar manualmente los recordatorios de vencimiento de pagos',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          description:
            'Periodo de facturación (YYYY-MM). Si se omite, se usa el mes actual.',
          example: '2026-06',
        },
        force: {
          type: 'boolean',
          description:
            'Si es true, saltea la validación de fecha y envía igual (para pruebas).',
          example: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen del resultado del envío de recordatorios.',
    schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', example: '2026-06' },
        propietariosConPendientes: { type: 'integer', example: 8 },
        propietariosNotificados: { type: 'integer', example: 7 },
        emailsSent: { type: 'integer', example: 7 },
        emailsFailed: { type: 'integer', example: 0 },
        emailsSkipped: { type: 'integer', example: 1 },
        errors: { type: 'array', items: { type: 'string' } },
        skippedReason: {
          type: 'string',
          example: 'Hoy no coincide con el recordatorio',
        },
      },
    },
  })
  async sendReminders(@Body() body?: { periodo?: string; force?: boolean }) {
    const now = new Date();
    const periodo =
      body?.periodo ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const force = body?.force === true;

    this.logger.log(
      `[PaymentsController] Disparo manual de recordatorios para periodo: ${periodo}${force ? ' (force)' : ''}`,
    );

    return this.reminderService.sendDueReminders(periodo, force);
  }

  /**
   * POST /payments/overdue-notices
   * Disparo manual del aviso de valores vencidos.
   * Body opcional:
   *   - force: true — saltea la validación de que hoy sea día 1 o 15, para
   *     poder probar el envío cualquier día.
   */
  @Post('overdue-notices')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar manualmente los avisos de valores vencidos (mora)',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description:
            'Si es true, saltea la validación de día (1 y 15) y envía igual.',
          example: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen del resultado del envío de avisos.',
    schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', example: '2026-08-15' },
        propietariosConVencidos: { type: 'integer', example: 5 },
        propietariosNotificados: { type: 'integer', example: 4 },
        emailsSent: { type: 'integer', example: 4 },
        emailsFailed: { type: 'integer', example: 0 },
        emailsSkipped: { type: 'integer', example: 1 },
        errors: { type: 'array', items: { type: 'string' } },
        skippedReason: {
          type: 'string',
          example: 'Hoy (día 7) no es día de aviso (1 y 15) - no se notifica',
        },
      },
    },
  })
  async sendOverdueNotices(@Body() body?: { force?: boolean }) {
    const force = body?.force === true;

    this.logger.log(
      `[PaymentsController] Disparo manual de avisos de mora${force ? ' (force)' : ''}`,
    );

    return this.overdueNoticeService.sendOverdueNotices(force);
  }
}
