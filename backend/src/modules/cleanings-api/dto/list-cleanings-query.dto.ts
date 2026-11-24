import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';
import { PHASE_NAMES } from '../../cleaning-tasks/constants/phase.constants';
import { isRealDay, parseInstant } from '../utils/iso-date.util';

export const CLEANING_PHASES = Object.values(PHASE_NAMES);

/** Sin parámetros de consulta: cualquiera que llegue es un 400. */
export class EmptyQueryDto {}

// Solo dígitos: `Number` daría por buenos '', ' 5 ', '0x10' o '1e2'.
const ToInt = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN,
  );

const rule =
  (
    name: string,
    message: string,
    validate: (value: unknown, args?: ValidationArguments) => boolean,
  ): PropertyDecorator =>
  (target, propertyKey) =>
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: String(propertyKey),
      options: { message },
      validator: { validate },
    });

const IsRealDay = () =>
  rule('isRealDay', '$property debe ser una fecha real YYYY-MM-DD', isRealDay);

const IsInstant = () =>
  rule(
    'isInstant',
    '$property debe ser ISO 8601 con hora y zona (Z u offset ±HH:MM)',
    (value) => parseInstant(value) !== null,
  );

// Un extremo ausente o mal escrito ya lo señala su propia regla.
const IsAfter = (from: string) =>
  rule('isAfter', `$property debe ser posterior a ${from}`, (value, args) => {
    const other = args?.object as Record<string, unknown> | undefined;
    const start = parseInstant(other?.[from]);
    const end = parseInstant(value);

    return start === null || end === null || start < end;
  });

export class ListCleaningsQueryDto {
  @IsOptional()
  @IsIn(CLEANING_PHASES)
  phase?: string;

  @IsOptional()
  @IsRealDay()
  date?: string;

  @IsOptional()
  @IsInstant()
  plannedFrom?: string;

  @IsOptional()
  @IsInstant()
  @IsAfter('plannedFrom')
  plannedTo?: string;

  @IsOptional()
  @IsInstant()
  endedFrom?: string;

  @IsOptional()
  @IsInstant()
  @IsAfter('endedFrom')
  endedTo?: string;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  employeeId?: number;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  unitId?: number;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset: number = 0;
}
