import { IsOptional, IsString } from 'class-validator'

export class CompleteIncidentDto {

  @IsOptional()
  @IsString()
  notes?: string

}
