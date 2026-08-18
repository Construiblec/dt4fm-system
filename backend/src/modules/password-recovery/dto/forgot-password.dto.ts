import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Nombre de usuario o correo registrado en OpenMAINT',
    example: 'raul.ontaneda',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  usernameOrEmail: string;
}
