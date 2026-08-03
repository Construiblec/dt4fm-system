import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewTaskDto {
  @ApiProperty({
    description: 'Aprobar o rechazar la tarea de limpieza',
    example: true,
  })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({
    description: 'Comentarios sobre la revisión',
    example: 'Limpieza realizada correctamente.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewComments?: string;
}
