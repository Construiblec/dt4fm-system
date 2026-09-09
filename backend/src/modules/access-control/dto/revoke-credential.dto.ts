import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * Motivo acotado y no texto libre: sin él, las revocaciones son
 * indistinguibles al investigar un incidente.
 */
export const REVOKE_REASONS = [
  'reservation_cancelled',
  'dates_changed',
  'manual',
  'contract_ended',
] as const;

export class RevokeCredentialDto {
  @ApiProperty({
    description: 'Por qué se revoca',
    enum: REVOKE_REASONS,
    example: 'manual',
  })
  @IsIn([...REVOKE_REASONS])
  reason: (typeof REVOKE_REASONS)[number];
}
