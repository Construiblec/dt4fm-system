import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  IsAfter,
  IsInstant,
  rule,
  ToBoolean,
  ToInt,
} from '../../integrations-api/dto/validation-rules';

const IsCompatibleWithAssigned = () =>
  rule(
    'isCompatibleWithAssigned',
    '$property no se combina con assigned=false',
    (_value, args) =>
      (args?.object as { assigned?: boolean }).assigned !== false,
  );

/** Filtros comunes a correctivos y preventivos; `status` lo define cada uno. */
export abstract class ListMaintenanceQueryBase {
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  assigned?: boolean;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  @IsCompatibleWithAssigned()
  employeeId?: number;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  teamId?: number;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  buildingId?: number;

  @IsOptional()
  @IsInstant()
  openedFrom?: string;

  @IsOptional()
  @IsInstant()
  @IsAfter('openedFrom')
  openedTo?: string;

  @IsOptional()
  @IsInstant()
  plannedFrom?: string;

  @IsOptional()
  @IsInstant()
  @IsAfter('plannedFrom')
  plannedTo?: string;

  @IsOptional()
  @IsInstant()
  startedFrom?: string;

  @IsOptional()
  @IsInstant()
  @IsAfter('startedFrom')
  startedTo?: string;

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
  @Max(100)
  limit: number = 50;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset: number = 0;
}
