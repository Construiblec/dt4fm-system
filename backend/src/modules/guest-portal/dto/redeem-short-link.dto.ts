import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RedeemShortLinkDto {
  @ApiProperty({
    description: 'Código del enlace corto (`/g/<código>`).',
    example: 'aB3dE5fG7h',
  })
  @IsString()
  @MaxLength(64)
  code: string;
}
