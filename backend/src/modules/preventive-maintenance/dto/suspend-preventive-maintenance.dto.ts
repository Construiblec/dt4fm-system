import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ChecklistAnswerDto } from './save-checklist.dto';

export class SuspendPreventiveMaintenanceDto {
  @ApiProperty({
    description: 'ID del valor del lookup `MaintProcess - SuspensionReason`',
    example: 266683,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reasonId: number;

  @ApiPropertyOptional({ description: 'Detalle de la suspensión' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Respuestas del checklist llevadas hasta el momento. Se guardan antes ' +
      'de marcar como N.D. las actividades que sigan sin resolver.',
    type: [ChecklistAnswerDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistAnswerDto)
  items?: ChecklistAnswerDto[];
}
