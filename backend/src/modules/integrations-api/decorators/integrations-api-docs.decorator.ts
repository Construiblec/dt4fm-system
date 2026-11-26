import { applyDecorators } from '@nestjs/common';
import { ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

const RESPONSES: [status: number, description: string][] = [
  [400, 'Parámetro o campo inválido o desconocido.'],
  [401, 'Clave ausente o inválida.'],
  [429, 'Cupo agotado (Retry-After: 60).'],
  [502, 'Falló la fuente de datos.'],
  [503, 'API o sesión no disponible.'],
  [504, 'La fuente no respondió a tiempo.'],
];

/** Lo común a los controladores de la API. */
export const CleaningsApiDocs = () =>
  applyDecorators(
    ApiTags('API de limpiezas'),
    ApiSecurity('x-api-key'),
    ...RESPONSES.map(([status, description]) =>
      ApiResponse({ status, description }),
    ),
  );
