import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendBulkDto } from './dto/send-bulk.dto';
import { MassSendDto } from './dto/mass-send.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── POST /notifications/bulk ─────────────────────────────────────────────

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Envío masivo (legacy)',
    description:
      'Endpoint original. Recibe el ID de plantilla y busca el contenido en openMAINT. ' +
      'Para nuevas integraciones desde openMAINT usar /notifications/mass-send.',
  })
  @ApiBody({ type: SendBulkDto })
  @ApiResponse({ status: 200, description: 'Resumen del envío.' })
  @ApiResponse({ status: 400, description: 'Body inválido.' })
  @ApiResponse({
    status: 404,
    description: 'Plantilla no encontrada en openMAINT.',
  })
  @ApiResponse({ status: 500, description: 'Error interno.' })
  async sendBulk(@Body() dto: SendBulkDto) {
    return this.notificationsService.sendBulk(dto);
  }

  // ─── POST /notifications/mass-send ───────────────────────────────────────

  @Post('mass-send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Envío masivo desde openMAINT',
    description:
      'Endpoint dedicado para la página personalizada de openMAINT. ' +
      'La plantilla (subject + body) viene directamente en el JSON — ' +
      'no se consulta openMAINT para obtenerla. ' +
      'El backend renderiza las variables {{clave}} por cada destinatario ' +
      'y despacha los correos vía SMTP. Los emails duplicados se eliminan automáticamente.',
  })
  @ApiBody({
    type: MassSendDto,
    examples: {
      ejemplo_basico: {
        summary: 'Comunicado sin variables',
        value: {
          template: {
            subject: 'Aviso importante — Edificio Central',
            body: '<p>No va a haber agua el día de hoy. Disculpe las molestias.</p>',
          },
          recipients: ['propietario@ejemplo.com', 'arrendatario@ejemplo.com'],
        },
      },
      ejemplo_con_variables: {
        summary: 'Comunicado con variables {{clave}}',
        value: {
          template: {
            subject: 'Comunicado — {{nombre}}',
            body: '<p>Estimado residente de {{nombre}}, le informamos sobre el periodo {{periodo}}.</p><p>Correo: {{email}}</p>',
          },
          recipients: ['propietario@ejemplo.com', 'arrendatario@ejemplo.com'],
          extraVars: {
            nombre: 'Edificio Central',
            periodo: 'Junio 2025',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen detallado del envío masivo.',
    schema: {
      example: {
        total: 2,
        sent: 2,
        failed: 0,
        results: [
          {
            to: 'propietario@ejemplo.com',
            success: true,
            messageId: '<abc@smtp.resend.com>',
          },
          {
            to: 'arrendatario@ejemplo.com',
            success: true,
            messageId: '<def@smtp.resend.com>',
          },
        ],
        recipientsRequested: 3,
        recipientsDeduplicated: 1,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Body inválido: template incompleto, recipients vacío o email con formato incorrecto.',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno al invocar el proveedor SMTP.',
  })
  async massSend(@Body() dto: MassSendDto) {
    return this.notificationsService.massSend(dto);
  }

  // ─── GET /notifications/mail/health ──────────────────────────────────────

  @Get('mail/health')
  @ApiOperation({
    summary: 'Health check del proveedor SMTP',
    description:
      'Verifica que el backend pueda conectarse al servidor SMTP configurado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de la conexión SMTP.',
    schema: { example: { ok: true } },
  })
  async mailHealth() {
    return this.notificationsService.verifyMailProvider();
  }
}
