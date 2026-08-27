import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Revisión del cierre de un correctivo, en el paso `CM05-Accounting`.
 *
 * No aplica a preventivos: `PM03-Advance` cierra el proceso directamente y un
 * proceso cerrado (`closed.completed`) tiene su tarea en `writable: false` y
 * `performer: "nobody"`, así que no se puede ni aprobar ni devolver.
 */
export class ReviewMaintenanceDto {
  @ApiProperty({
    description:
      'true → aprobar el cierre (`CM05-Advance`). false → devolver a ' +
      'asignación (`CM05-Back`) conservando cesionario y equipo.',
    example: true,
  })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({
    description:
      'Observación de la revisión. **Obligatoria cuando `approved` es false** ' +
      '— se valida en el servicio, no aquí, porque depende del otro campo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
