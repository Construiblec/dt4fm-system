import {
  Controller,
  HttpCode,
  HttpStatus,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  MeetingRemindersService,
  type MeetingReminderSummary,
} from './meeting-reminders.service';

@ApiTags('Meeting Reminders')
@Controller('meeting-reminders')
export class MeetingRemindersController {
  constructor(
    private readonly meetingRemindersService: MeetingRemindersService,
  ) {}

  // ─── POST /meeting-reminders/run ──────────────────────────────────────────

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ejecuta el recordatorio de reuniones manualmente',
    description:
      'Dispara el mismo flujo que el cron diario: consulta Reuniones en ' +
      'openMAINT, filtra las que faltan N días, cruza con Tenant por edificio ' +
      'y tipo de ocupación, y envía los correos. Útil para probar en local.',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description:
      'Fuerza la ventana de días en lugar de MEETING_REMINDER_DAYS_BEFORE. ' +
      'Útil para apuntar a una reunión concreta durante pruebas.',
  })
  @ApiQuery({
    name: 'dryRun',
    required: false,
    type: Boolean,
    description:
      'Si es true, calcula los destinatarios pero NO envía correos. ' +
      'Permite verificar el cruce sin gastar envíos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen del recordatorio (reuniones evaluadas y destinatarios).',
  })
  async run(
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
    @Query('dryRun', new ParseBoolPipe({ optional: true })) dryRun?: boolean,
  ): Promise<MeetingReminderSummary> {
    return this.meetingRemindersService.runReminderJob({
      daysBefore: days,
      dryRun,
    });
  }
}
