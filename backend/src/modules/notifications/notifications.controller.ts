import { Body, Controller, Get, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SendBulkDto } from './dto/send-bulk.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * POST /notifications/bulk
   * Envía un comunicado masivo "ahora" a partir de una plantilla de openMAINT
   * y un alcance (todos / propietarios / arrendatarios).
   *
   * Lo consume la página personalizada de openMAINT.
   */
  @Post('bulk')
  async sendBulk(@Body() dto: SendBulkDto) {
    return this.notificationsService.sendBulk(dto);
  }

  /**
   * GET /notifications/mail/health
   * Verifica que el proveedor SMTP configurado responda correctamente.
   */
  @Get('mail/health')
  async mailHealth() {
    return this.notificationsService.verifyMailProvider();
  }
}
