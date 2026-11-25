import { applyDecorators, BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import type {
  CleaningPlanChange,
  CleaningPlanFields,
} from '../../cleaning-tasks/cleaning-planning.types';
import {
  IsAfter,
  IsInstant,
  IsPositiveInt,
  IsRealDay,
  IsText,
  Nullable,
  Optional,
  Trim,
} from './validation-rules';

export const MAX_CHANGES = 25;

const NullableId = (description: string) =>
  applyDecorators(
    ApiPropertyOptional({
      type: 'integer',
      minimum: 1,
      nullable: true,
      description,
    }),
    Nullable(),
    IsPositiveInt(),
  );

const NullableInstant = (description: string) =>
  applyDecorators(
    ApiPropertyOptional({
      type: 'string',
      format: 'date-time',
      nullable: true,
      description,
      example: '2026-11-26T10:00:00-05:00',
    }),
    Nullable(),
    IsInstant(),
  );

/** Campo ausente = sin cambio; `null` = borrar. */
export class CleaningPlanFieldsDto {
  @NullableId('Operario de limpieza; null lo quita')
  employeeId?: number | null;

  @NullableInstant('Inicio planeado, con zona; null lo borra')
  plannedStartTime?: string | null;

  @NullableInstant('Fin planeado, posterior al inicio; null lo borra')
  @IsAfter('plannedStartTime')
  plannedEndTime?: string | null;

  @NullableId('Checklist de ejecución; null lo quita')
  checklistId?: number | null;

  @NullableId('Unidad; null la quita')
  unitId?: number | null;

  @ApiPropertyOptional({
    type: 'string',
    maxLength: 500,
    nullable: true,
    description: 'Indicaciones; null las borra',
  })
  @Nullable()
  @IsText(0, 500)
  observations?: string | null;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date',
    description: 'Día de salida (YYYY-MM-DD)',
    example: '2026-11-26',
  })
  @Optional()
  @IsRealDay()
  checkoutDate?: string;

  @ApiPropertyOptional({ type: 'string', minLength: 1, maxLength: 200 })
  @Optional()
  @Trim()
  @IsText(1, 200)
  description?: string;
}

export class CleaningPlanChangeDto extends CleaningPlanFieldsDto {
  @ApiProperty({ type: 'integer', minimum: 1, description: 'Limpieza' })
  @IsPositiveInt()
  id: number;
}

export class CleaningPlanBatchDto {
  @ApiPropertyOptional({
    type: 'boolean',
    default: false,
    description: 'Solo valida: no guarda nada',
  })
  @Optional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    type: () => [CleaningPlanChangeDto],
    minItems: 1,
    maxItems: MAX_CHANGES,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHANGES)
  // Descarta los arrays, que ValidateNested daría por buenos.
  @IsObject({ each: true })
  @ArrayUnique((change?: CleaningPlanChangeDto | null) => change?.id, {
    message: 'changes no puede repetir el id de una limpieza',
  })
  @ValidateNested({ each: true })
  @Type(() => CleaningPlanChangeDto)
  changes: CleaningPlanChangeDto[];
}

export class CancelCleaningDto {
  @ApiProperty({ type: 'string', minLength: 1, maxLength: 500 })
  @Trim()
  @IsText(1, 500)
  reason: string;
}

// `undefined` y `null` pasan tal cual: significan cosas distintas.
const toUtc = (value: string | null | undefined) =>
  value ? new Date(value).toISOString() : value;

export const toPlanFields = (
  dto: CleaningPlanFieldsDto,
  path = 'El cuerpo',
): CleaningPlanFields => {
  const fields: CleaningPlanFields = {
    ...dto,
    plannedStartTime: toUtc(dto.plannedStartTime),
    plannedEndTime: toUtc(dto.plannedEndTime),
  };
  const present = Object.entries(fields).filter(([, v]) => v !== undefined);

  if (!present.length) {
    throw new BadRequestException(
      `${path} debe incluir al menos un campo para cambiar`,
    );
  }

  return Object.fromEntries(present) as CleaningPlanFields;
};

export const toPlanChanges = (
  changes: CleaningPlanChangeDto[],
): CleaningPlanChange[] =>
  changes.map(({ id, ...fields }, index) => ({
    id,
    ...toPlanFields(fields, `changes.${index}`),
  }));
