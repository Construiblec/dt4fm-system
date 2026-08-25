import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Nombre de usuario o correo de la cuenta de openMAINT',
    example: 'pamela.calo',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    description: 'Contraseña de la cuenta',
    example: 'password123',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description:
      'Grupo con el que emitir la sesión. Si se omite, openMAINT usa el grupo ' +
      'por defecto del usuario. Es el Code del rol, no su Description.',
    example: 'SupervisorLimpieza',
  })
  @IsString()
  @IsOptional()
  role?: string;
}
