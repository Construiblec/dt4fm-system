import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class UpdatePlannedStartDto {
  @ApiProperty({
    description:
      'Fecha prevista de inicio de ejecución (ISO 8601). Se guarda en ' +
      '`ExpExecStartDate`, que solo es escribible en CM02 / PM02.',
    example: '2026-08-25T09:00:00.000Z',
  })
  @IsISO8601()
  plannedStart: string;
}
