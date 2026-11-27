import { BadRequestException } from '@nestjs/common';
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
import {
  IsInstant,
  IsPositiveInt,
  IsText,
  Optional,
  Trim,
} from '../../integrations-api/dto/validation-rules';
import {
  NOTES_ALONE_MESSAGE,
  type MaintenancePlanChange,
  type PreventivePlanFields,
} from '../../maintenance-supervision/maintenance-integration.types';
import { MAX_CHANGES, requireFields, toUtc } from './maintenance-plan.dto';

/** Campo ausente = sin cambio; ninguno admite `null`. */
export class PreventivePlanFieldsDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Técnico de un equipo de mantenimiento',
  })
  @Optional()
  @IsPositiveInt()
  employeeId?: number;

  @ApiPropertyOptional({
    type: 'string',
    format: 'date-time',
    description:
      'Inicio previsto, con zona. Se fija con la asignación o después de ella',
    example: '2026-11-26T10:00:00-05:00',
  })
  @Optional()
  @IsInstant()
  plannedStartTime?: string;

  @ApiPropertyOptional({
    type: 'string',
    minLength: 1,
    maxLength: 500,
    description:
      'Nota del cambio. Sola es un 400: solo se registra en un avance del flujo (asignar, cambiar el técnico de un preventivo suspendido o cancelar); en un simple guardado llega el aviso notes_not_saved',
  })
  @Optional()
  @Trim()
  @IsText(1, 500)
  notes?: string;
}

export class PreventivePlanChangeDto extends PreventivePlanFieldsDto {
  @ApiProperty({ type: 'integer', minimum: 1, description: 'Preventivo' })
  @IsPositiveInt()
  id: number;
}

export class PreventivePlanBatchDto {
  @ApiPropertyOptional({
    type: 'boolean',
    default: false,
    description: 'Solo valida: no guarda nada',
  })
  @Optional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({
    type: () => [PreventivePlanChangeDto],
    minItems: 1,
    maxItems: MAX_CHANGES,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHANGES)
  // Descarta los arrays, que ValidateNested daría por buenos.
  @IsObject({ each: true })
  @ArrayUnique((change?: PreventivePlanChangeDto | null) => change?.id, {
    message: 'changes no puede repetir el id de un preventivo',
  })
  @ValidateNested({ each: true })
  @Type(() => PreventivePlanChangeDto)
  changes: PreventivePlanChangeDto[];
}

export const toPlanFields = (
  dto: PreventivePlanFieldsDto,
  path = 'El cuerpo',
): PreventivePlanFields => {
  const fields = requireFields(
    { ...dto, plannedStartTime: toUtc(dto.plannedStartTime) },
    path,
  );
  if (Object.keys(fields).every((name) => name === 'notes')) {
    throw new BadRequestException(`${path}: ${NOTES_ALONE_MESSAGE}`);
  }
  return fields;
};

export const toPlanChanges = (
  changes: PreventivePlanChangeDto[],
): MaintenancePlanChange[] =>
  changes.map(({ id, ...fields }, index) => ({
    id,
    ...toPlanFields(fields, `changes.${index}`),
  }));
