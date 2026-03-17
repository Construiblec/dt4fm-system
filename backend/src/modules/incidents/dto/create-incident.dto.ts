import { Type } from 'class-transformer'
import { IsInt, IsString, Min } from 'class-validator'

export class CreateIncidentDto {

  @Type(() => Number)
  @IsInt()
  @Min(1)
  buildingId: number

  @IsString()
  floorArea: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority: number

  @IsString()
  notes: string

}
