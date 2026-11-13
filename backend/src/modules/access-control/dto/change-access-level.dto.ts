import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
} from 'class-validator';

/**
 * Estado final que pide el Supervisor CAV. `accessScopes` es el formato nuevo;
 * `accessLevel` se mantiene mientras el frontend anterior siga desplegado.
 */
export class ChangeAccessLevelDto {
  @ApiPropertyOptional({
    description:
      'Scopes finales. `[]` retira el PIN de todas las puertas; uno o dos sobre un acceso revocado lo restauran con el mismo PIN.',
    type: [String],
    enum: ['pedestrian', 'vehicular'],
    example: ['pedestrian'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(['pedestrian', 'vehicular'], { each: true })
  accessScopes?: ('pedestrian' | 'vehicular')[];

  @ApiPropertyOptional({
    description: 'Formato anterior, equivalente a `accessScopes`.',
    enum: ['pedestrian', 'vehicular', 'both', 'none'],
    deprecated: true,
  })
  @IsOptional()
  @IsIn(['pedestrian', 'vehicular', 'both', 'none'])
  accessLevel?: 'pedestrian' | 'vehicular' | 'both' | 'none';
}
