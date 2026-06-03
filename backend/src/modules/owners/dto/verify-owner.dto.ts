import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyOwnerDto {
  @ApiProperty({ description: 'Número de identificación / Cédula del propietario', example: '1721548769' })
  @IsString()
  @IsNotEmpty()
  idNumber: string;
}
