import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IssueGuestLinkDto {
  @ApiProperty({
    description:
      'Identificador de la estancia (`guest_stay.id`). No es el id de la ' +
      'reserva de Hostaway: la clave del portal es siempre la fila local.',
    example: 'c47ca6f1-f675-4653-a3a6-31487feb054b',
  })
  @IsUUID('4', { message: 'stayId debe ser un uuid de guest_stay.' })
  stayId: string;
}
