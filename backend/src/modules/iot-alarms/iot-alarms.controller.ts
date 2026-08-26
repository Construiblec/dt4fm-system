import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CreateIotAlarmDto } from './dto/create-iot-alarm.dto';
import { IotWebhookGuard } from './guards/iot-webhook.guard';
import { IotAlarmsService } from './iot-alarms.service';

@ApiTags('Alarmas IoT')
@ApiSecurity('x-iot-secret')
@Controller('iot/alarms')
@UseGuards(IotWebhookGuard)
export class IotAlarmsController {
  constructor(private readonly iotAlarmsService: IotAlarmsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Registrar una alarma del servidor IoT como mantenimiento correctivo',
    description:
      'Lo emite el servidor Raspberry cuando su motor de reglas detecta un fallo. Obligatorios: assetCode, event y timestamp; el resto del cuerpo se conserva en las notas del correctivo.',
  })
  @ApiResponse({ status: 201, description: 'Correctivo abierto en openMAINT.' })
  @ApiResponse({ status: 401, description: 'Secreto de webhook inválido.' })
  @ApiResponse({ status: 502, description: 'openMAINT no aceptó la alarma.' })
  @ApiResponse({ status: 503, description: 'Webhook sin configurar.' })
  async receive(@Body() dto: CreateIotAlarmDto, @Req() request: Request) {
    // El cuerpo crudo va aparte: el ValidationPipe global usa whitelist y
    // descarta del DTO los campos de medición, que cambian según la alarma.
    return this.iotAlarmsService.handle(dto, request.body);
  }
}
