import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Solo los campos que el backend necesita para decidir. El resto del cuerpo
 * (medición, `building`, `place`…) varía según el tipo de alarma y se conserva
 * aparte: el `ValidationPipe` global usa `whitelist: true` y descarta de este
 * objeto todo lo no declarado.
 */
export class CreateIotAlarmDto {
  @ApiProperty({
    description: 'Code del activo en openMAINT, registrado en el dispositivo',
    example: 'CAL 01',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  assetCode: string;

  @ApiProperty({
    description: 'Tipo de alarma que emite el motor de reglas de la Raspberry',
    example: 'GLP1_LOW_PRESSURE',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  event: string;

  @ApiProperty({
    description: 'Momento de detección en la Pi (ISO 8601)',
    example: '2026-08-25T10:52:55-05:00',
  })
  @IsISO8601()
  timestamp: string;

  @ApiPropertyOptional({
    description:
      'Texto legible de la alarma; encabeza el asunto del correctivo',
    example: 'Presion baja en tanque GLP',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    description: 'Identificador del dispositivo emisor',
    example: 'GLP001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  device?: string;
}
