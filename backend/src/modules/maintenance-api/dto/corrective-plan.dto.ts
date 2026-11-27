import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  ValidateNested,
} from 'class-validator';
import {
  IsInstant,
  IsPositiveInt,
  IsText,
  Optional,
  Trim,
} from '../../integrations-api/dto/validation-rules';
import {
  CORRECTIVE_PRIORITIES,
  NOTES_ALONE_MESSAGE,
  type CorrectivePlanFields,
  type MaintenancePlanChange,
} from '../../maintenance-supervision/maintenance-integration.types';
import { MAX_CHANGES, requireFields, toUtc } from './maintenance-plan.dto';

/** Campo ausente = sin cambio; ninguno admite `null`. */
export class CorrectivePlanFieldsDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Técnico de un equipo de mantenimiento',
  })
  @Optional()
  @IsPositiveInt()
  employeeId?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Equipo de destino; el técnico debe pertenecerle',
  })
  @Optional()
  @IsPositiveInt()
  teamId?: number;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date-time',
    description:
      'Inicio previsto, con zona. Solo se mueve antes de asignar o, con la acción de reasignación disponible, estando asignado y sin empezar',
    example: '2026-11-26T10:00:00-05:00',
  })
  @Optional()
  @IsInstant()
  plannedStartTime?: string;

  @ApiPropertyOptional({ enum: CORRECTIVE_PRIORITIES })
  @Optional()
  @IsIn(CORRECTIVE_PRIORITIES)
  priority?: (typeof CORRECTIVE_PRIORITIES)[number];

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Va siempre junto a subcategoryId',
  })
  @Optional()
  @IsPositiveInt()
  categoryId?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Va siempre junto a categoryId',
  })
  @Optional()
  @IsPositiveInt()
  subcategoryId?: number;

  @ApiPropertyOptional({
    type: 'string',
    minLength: 1,
    maxLength: 80,
    description:
      'Título cuando la subcategoría es «Otro»; obligatorio si no hay un título que conservar',
  })
  @Optional()
  @Trim()
  @IsText(1, 80)
  otherDescription?: string;

  @ApiPropertyOptional({
    type: 'string',
    minLength: 1,
    maxLength: 500,
    description:
      'Nota del cambio. Sola es un 400: solo se registra en un avance del flujo (asignar, cambiar el técnico o cancelar); en un simple guardado llega el aviso notes_not_saved',
  })
  @Optional()
  @Trim()
  @IsText(1, 500)
  notes?: string;
}

export class CorrectivePlanChangeDto extends CorrectivePlanFieldsDto {
  @ApiProperty({ type: 'integer', minimum: 1, description: 'Correctivo' })
  @IsPositiveInt()
  id: number;
}

export class CorrectivePlanBatchDto {
  @ApiPropertyOptional({
    type: 'boolean',
    default: false,
    description: 'Solo valida: no guarda nada',
  })
  @Optional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    type: () => [CorrectivePlanChangeDto],
    minItems: 1,
    maxItems: MAX_CHANGES,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHANGES)
  // Descarta los arrays, que ValidateNested daría por buenos.
  @IsObject({ each: true })
  @ArrayUnique((change?: CorrectivePlanChangeDto | null) => change?.id, {
    message: 'changes no puede repetir el id de un correctivo',
  })
  @ValidateNested({ each: true })
  @Type(() => CorrectivePlanChangeDto)
  changes: CorrectivePlanChangeDto[];
}

export const toPlanFields = (
  dto: CorrectivePlanFieldsDto,
  path = 'El cuerpo',
): CorrectivePlanFields => {
  const fields = requireFields(
    { ...dto, plannedStartTime: toUtc(dto.plannedStartTime) },
    path,
  );
  if (Object.keys(fields).every((name) => name === 'notes')) {
    throw new BadRequestException(`${path}: ${NOTES_ALONE_MESSAGE}`);
  }
  if (
    (fields.categoryId === undefined) !==
    (fields.subcategoryId === undefined)
  ) {
    throw new BadRequestException(
      `${path}: categoryId y subcategoryId se envían juntos`,
    );
  }
  return fields;
};

export const toPlanChanges = (
  changes: CorrectivePlanChangeDto[],
): MaintenancePlanChange[] =>
  changes.map(({ id, ...fields }, index) => ({
    id,
    ...toPlanFields(fields, `changes.${index}`),
  }));
