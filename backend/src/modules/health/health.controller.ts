import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Estado del Sistema')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Verificar el estado de salud del servicio' })
  @ApiResponse({
    status: 200,
    description: 'El servicio está en funcionamiento',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-06-03T13:36:00.000Z' },
      },
    },
  })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
