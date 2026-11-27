import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsText, Trim } from '../../integrations-api/dto/validation-rules';

export const MAX_CHANGES = 25;

export class CancelMaintenanceDto {
  @ApiProperty({ type: 'string', minLength: 1, maxLength: 500 })
  @Trim()
  @IsText(1, 500)
  reason: string;
}

/** `undefined` = sin cambio; la hora pasa a UTC. */
export const toUtc = (value: string | undefined) =>
  value ? new Date(value).toISOString() : value;

/** Quita lo ausente y exige al menos un campo. */
export const requireFields = <T extends object>(fields: T, path: string): T => {
  const present = Object.entries(fields).filter(([, v]) => v !== undefined);

  if (!present.length) {
    throw new BadRequestException(
      `${path} debe incluir al menos un campo para cambiar`,
    );
  }

  return Object.fromEntries(present) as T;
};
