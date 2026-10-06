import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Lo único que el huésped aporta. Edificio y unidad no se declaran: salen de
 * su estancia, y el `whitelist` global descarta cualquier intento de enviarlos.
 */
export class CreateGuestIncidentDto {
  @ApiProperty({
    description: 'Qué está pasando',
    example: 'No sale agua caliente en la ducha',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Describe el problema.' })
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({
    description: 'Dónde, si no es dentro del departamento',
    example: 'Baño principal',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  location?: string;
}
