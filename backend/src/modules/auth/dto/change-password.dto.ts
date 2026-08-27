import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Contraseña actual, para confirmar identidad' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ description: 'Contraseña nueva', minLength: 8 })
  @IsString()
  @MinLength(8, {
    message: 'La contraseña nueva debe tener al menos 8 caracteres',
  })
  newPassword: string;
}
