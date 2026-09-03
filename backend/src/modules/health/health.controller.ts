// Ensayo de vuelta atrás del 2026-09-03 (BP-004): este comentario es el cambio
// inofensivo que se despliega y se revierte para medir cuánto tarda un rollback
// real en staging. Si sigue aquí después del ensayo, el revert no se aplicó.
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
        commit: {
          type: 'string',
          nullable: true,
          example: '0629591',
          description:
            'SHA (o prefijo) del commit desplegado. Null si no está definido en el entorno.',
        },
      },
    },
  })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      // Render define RENDER_GIT_COMMIT automáticamente en cada deploy. Sin
      // ella (local, u otro proveedor) cae a GIT_SHA si alguien la define a
      // mano, y si tampoco existe queda en null: el smoke test del CI la usa
      // para confirmar que /health ya sirve el código nuevo, no el anterior.
      commit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_SHA ?? null,
    };
  }
}
