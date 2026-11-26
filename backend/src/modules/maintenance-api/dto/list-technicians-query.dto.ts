import { IsOptional } from 'class-validator';
import {
  ComesWith,
  IsAfter,
  IsInstant,
  IsWithinDays,
} from '../../integrations-api/dto/validation-rules';

export const MAX_RANGE_DAYS = 14;

export class ListTechniciansQueryDto {
  @IsOptional()
  @IsInstant()
  @ComesWith('to')
  from?: string;

  @IsOptional()
  @IsInstant()
  @ComesWith('from')
  @IsAfter('from')
  @IsWithinDays('from', MAX_RANGE_DAYS)
  to?: string;
}
