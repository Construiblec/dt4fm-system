import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * El equivalente de `ChangeScopeDto` para la pantalla del Supervisor CAV, que
 * llama al campo `accessLevel` en vez de `scope`. Son el `CredentialScope` más
 * `none`, que revoca todas las puertas.
 */
export class ChangeAccessLevelDto {
  @ApiProperty({
    description:
      'A qué habilita el PIN. `none` lo retira de todas las puertas; un nivel sobre un acceso revocado lo restaura con el mismo PIN.',
    enum: ['pedestrian', 'vehicular', 'both', 'none'],
    example: 'both',
  })
  @IsIn(['pedestrian', 'vehicular', 'both', 'none'])
  accessLevel: 'pedestrian' | 'vehicular' | 'both' | 'none';
}
