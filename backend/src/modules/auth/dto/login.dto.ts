import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Nombre de usuario o identificador de sesión',
    example: 'usuario_demo',
  })
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Contraseña de la cuenta',
    example: 'password123',
  })
  @IsString()
  password: string;
}
