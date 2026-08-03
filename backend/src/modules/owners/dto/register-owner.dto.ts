import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class RegisterOwnerDto {
  @ApiProperty({
    description: 'Número de identificación / Cédula del propietario',
    example: '1721548769',
  })
  @IsString()
  @IsNotEmpty()
  idNumber: string;

  @ApiProperty({
    description: 'Nombre de usuario para el login',
    example: 'juan_perez',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    description: 'Contraseña de la cuenta (mínimo 6 caracteres)',
    minLength: 6,
    example: 'secreto123',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
