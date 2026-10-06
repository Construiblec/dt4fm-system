import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * El equivalente de `ChangeScopeDto` para la pantalla del Supervisor CAV, que
 * llama al campo `accessLevel` en vez de `scope`. Los valores son los mismos:
 * son el `CredentialScope` de siempre.
 */
export class ChangeAccessLevelDto {
  @ApiProperty({
    description:
      'A qué habilita el PIN. Ampliar escribe en las puertas nuevas; reducir lo retira de las que dejan de estar en el ámbito. El PIN no cambia.',
    enum: ['pedestrian', 'vehicular', 'both'],
    example: 'both',
  })
  @IsIn(['pedestrian', 'vehicular', 'both'])
  accessLevel: 'pedestrian' | 'vehicular' | 'both';
}
