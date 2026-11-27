import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  IsAfter,
  IsInstant,
  ToInt,
} from '../../integrations-api/dto/validation-rules';
import { VALID_PM_STATUSES } from '../../preventive-maintenance/constants/preventive-maint.constants';
import { ListMaintenanceQueryBase } from './list-maintenance-query.base';

export class ListPreventivesQueryDto extends ListMaintenanceQueryBase {
  @IsOptional()
  @IsIn(VALID_PM_STATUSES)
  status?: string;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  assetId?: number;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  planId?: number;

  @IsOptional()
  @IsInstant()
  dueFrom?: string;

  @IsOptional()
  @IsInstant()
  @IsAfter('dueFrom')
  dueTo?: string;
}
