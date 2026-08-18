import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Token recibido en el enlace del correo',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  token: string;

  @ApiProperty({
    description: 'Nueva contraseña',
    example: 'MiClaveSegura2026.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128)
  newPassword: string;
}
