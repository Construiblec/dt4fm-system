import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class ChangeScopeDto {
  @ApiProperty({
    description:
      'Nuevo ámbito. Ampliar escribe en las puertas nuevas; reducir retira la credencial de las que dejan de estar en el ámbito. El PIN no cambia.',
    enum: ['pedestrian', 'vehicular', 'both'],
    example: 'both',
  })
  @IsIn(['pedestrian', 'vehicular', 'both'])
  scope: 'pedestrian' | 'vehicular' | 'both';
}
