import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectMaintenanceDto {
  @ApiProperty({
    description:
      'Motivo del rechazo. Obligatorio: queda en la bitácora del proceso y ' +
      'es lo único que explica por qué se cerró sin ejecutar.',
    example: 'El reporte corresponde a un bien del propietario, no del condominio.',
  })
  @IsString()
  @IsNotEmpty({ message: 'El motivo del rechazo es obligatorio' })
  @MaxLength(2000)
  notes: string;
}
