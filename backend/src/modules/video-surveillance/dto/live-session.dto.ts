import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LiveSessionDto {
  @ApiProperty({
    description:
      'Uno nuevo por cada clic del operador, también al reintentar. Es el identificador de la visualización en la auditoría y en el log de la VPS.',
    example: '6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13',
  })
  @IsUUID()
  requestId: string;
}
