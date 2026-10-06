import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RemoteOpenDto {
  @ApiProperty({
    description:
      'Uno por clic intencional, generado por el cliente. Reenviarlo devuelve el resultado guardado y no repite el pulso; uno nuevo siempre es un pulso nuevo.',
    example: '6f1c9a5e-3b2d-4c8e-9a71-0d4e2f5b8c13',
  })
  @IsUUID()
  requestId: string;
}
