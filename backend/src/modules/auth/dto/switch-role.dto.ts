import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SwitchRoleDto {
  @ApiProperty({
    description:
      'Grupo al que cambiar la sesión activa. Es el Code del rol de openMAINT ' +
      '(p. ej. SupervisorLimpieza), no su Description. Debe estar entre los ' +
      'availableRoles que devolvió el login.',
    example: 'SupervisorLimpieza',
  })
  @IsString()
  @IsNotEmpty()
  role: string;
}
