import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ContactAdminDto {
  @ApiProperty({ description: 'Asunto del mensaje', example: 'Problema con el cobro de expensas' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ description: 'Cuerpo del mensaje o consulta', example: 'Buenas tardes, quisiera reportar un cobro duplicado.' })
  @IsString()
  @IsNotEmpty()
  message: string;
}
