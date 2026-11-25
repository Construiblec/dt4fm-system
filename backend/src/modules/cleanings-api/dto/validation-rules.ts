import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';
import { isRealDay, parseInstant } from '../utils/iso-date.util';

const DAY_MS = 24 * 60 * 60 * 1000;

export const rule =
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

const sibling = (args: ValidationArguments | undefined, name: string) =>
  (args?.object as Record<string, unknown> | undefined)?.[name];

/** Puede faltar, pero no ser `null`. */
export const Optional = () =>
  ValidateIf((_, value: unknown) => value !== undefined);

/** Puede faltar; `null` significa «borrar». */
export const Nullable = () =>
  ValidateIf((_, value: unknown) => value !== undefined && value !== null);

// Solo dígitos: `Number` daría por buenos '', ' 5 ', '0x10' o '1e2'.
export const ToInt = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN,
  );

/** Solo 'true' y 'false'; lo demás queda igual y lo rechaza @IsBoolean. */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === 'false' ? value === 'true' : value,
  );

export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export const IsPositiveInt = () =>
  rule(
    'isPositiveInt',
    '$property debe ser un entero positivo',
    (value) => Number.isSafeInteger(value) && (value as number) >= 1,
  );

export const IsText = (min: number, max: number) =>
  rule(
    'isText',
    `$property debe ser un texto de ${min} a ${max} caracteres`,
    (value) =>
      typeof value === 'string' && value.length >= min && value.length <= max,
  );

export const IsRealDay = () =>
  rule('isRealDay', '$property debe ser una fecha real YYYY-MM-DD', isRealDay);

export const IsInstant = () =>
  rule(
    'isInstant',
    '$property debe ser ISO 8601 con hora y zona (Z u offset ±HH:MM)',
    (value) => parseInstant(value) !== null,
  );

// Un extremo ausente o mal escrito ya lo señala su propia regla.
export const IsAfter = (from: string) =>
  rule('isAfter', `$property debe ser posterior a ${from}`, (value, args) => {
    const start = parseInstant(sibling(args, from));
    const end = parseInstant(value);

    return start === null || end === null || start < end;
  });

export const IsWithinDays = (from: string, days: number) =>
  rule(
    'isWithinDays',
    `El rango no puede superar ${days} días`,
    (value, args) => {
      const start = parseInstant(sibling(args, from));
      const end = parseInstant(value);

      return start === null || end === null || end - start <= days * DAY_MS;
    },
  );

export const ComesWith = (other: string) =>
  rule(
    'comesWith',
    `$property y ${other} van juntos`,
    (_value, args) => sibling(args, other) !== undefined,
  );
