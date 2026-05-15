import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  commonAreaId: string;

  @IsString()
  @IsNotEmpty()
  // Formato: yyyy-MM-ddTHH:mm:ss
  fechaInicio: string;

  @IsString()
  @IsNotEmpty()
  // Formato: yyyy-MM-ddTHH:mm:ss
  fechaFin: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
