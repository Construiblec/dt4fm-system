import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ToInt } from '../../integrations-api/dto/validation-rules';
import { VALID_CM_STATUSES } from '../../maintenance-supervision/constants/corrective-maint.constants';
import { CORRECTIVE_PRIORITIES } from '../../maintenance-supervision/maintenance-integration.types';
import { ListMaintenanceQueryBase } from './list-maintenance-query.base';

/** Los de OpenMAINT más `Assigned`, que se deriva del inicio real. */
export const CORRECTIVE_STATUSES = [...VALID_CM_STATUSES, 'Assigned'];

export class ListCorrectivesQueryDto extends ListMaintenanceQueryBase {
  @IsOptional()
  @IsIn(CORRECTIVE_STATUSES)
  status?: string;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  unitId?: number;

  @IsOptional()
  @IsIn(CORRECTIVE_PRIORITIES)
  priority?: (typeof CORRECTIVE_PRIORITIES)[number];

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  categoryId?: number;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  subcategoryId?: number;
}
