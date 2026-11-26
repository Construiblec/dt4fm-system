import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PHASE_NAMES } from '../../cleaning-tasks/constants/phase.constants';
import {
  IsAfter,
  IsInstant,
  IsRealDay,
  rule,
  ToBoolean,
  ToInt,
} from '../../integrations-api/dto/validation-rules';

export const CLEANING_PHASES = Object.values(PHASE_NAMES);

const IsCompatibleWithAssigned = () =>
  rule(
    'isCompatibleWithAssigned',
    '$property no se combina con assigned=false',
    (_value, args) =>
      (args?.object as ListCleaningsQueryDto).assigned !== false,
  );

export class ListCleaningsQueryDto {
  @IsOptional()
  @IsIn(CLEANING_PHASES)
  phase?: string;

  @IsOptional()
  @IsRealDay()
  date?: string;

  @IsOptional()
  @IsRealDay()
  checkoutDate?: string;

  @IsOptional()
  @IsInstant()
  plannedFrom?: string;

  @IsOptional()
  @IsInstant()
  @IsAfter('plannedFrom')
  plannedTo?: string;

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
  @Max(Number.MAX_SAFE_INTEGER)
  @IsCompatibleWithAssigned()
  employeeId?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  assigned?: boolean;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  unitId?: number;

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
