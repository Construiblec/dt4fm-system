import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChecklistAnswerDto {
  @ApiProperty({
    description: 'ID de la definición de la actividad (TaskDef)',
    example: 6861754,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  taskDefId: number;

  @ApiProperty({
    description:
      'Resultado de la actividad. Para los tipos con desplegable es el ID ' +
      'de la opción; para fecha/hora, su valor en texto.',
    example: '345544',
  })
  @IsString()
  value: string;
}

export class SaveChecklistDto {
  @ApiProperty({
    description: 'Respuestas a las actividades del checklist',
    type: [ChecklistAnswerDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChecklistAnswerDto)
  items: ChecklistAnswerDto[];
}
