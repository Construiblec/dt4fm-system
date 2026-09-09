import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCredentialDto {
  @ApiProperty({
    description: 'A quién pertenece el permiso',
    enum: ['guest', 'tenant', 'employee'],
    example: 'tenant',
  })
  @IsIn(['guest', 'tenant', 'employee'])
  subjectType: 'guest' | 'tenant' | 'employee';

  @ApiProperty({
    description:
      'Referencia al sujeto en su sistema de origen: reserva de Hostaway, Tenant._id o Employee._id',
    example: '4471',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  subjectRef: string;

  @ApiProperty({
    description: 'Nombre de la persona al emitir; queda denormalizado',
    example: 'Ana Pérez',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiProperty({
    description: 'Puertas que abre. Hoy solo hay entrada peatonal y vehicular',
    enum: ['pedestrian', 'vehicular', 'both'],
    example: 'pedestrian',
  })
  @IsIn(['pedestrian', 'vehicular', 'both'])
  scope: 'pedestrian' | 'vehicular' | 'both';

  @ApiProperty({
    description: 'Building._id de openMAINT. Debe tener control de accesos',
    example: 3025058,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buildingId: number;

  @ApiPropertyOptional({
    description: 'Unit._id. Solo contexto: no decide dónde se coloca el PIN',
    example: 3110665,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  openmaintUnitId?: number;

  @ApiProperty({
    description: 'Inicio de vigencia, ISO 8601 con offset',
    example: '2026-09-14T12:00:00-05:00',
  })
  @IsISO8601()
  validFrom: string;

  @ApiProperty({
    description: 'Fin de vigencia, ISO 8601 con offset',
    example: '2026-09-18T15:00:00-05:00',
  })
  @IsISO8601()
  validTo: string;
}
