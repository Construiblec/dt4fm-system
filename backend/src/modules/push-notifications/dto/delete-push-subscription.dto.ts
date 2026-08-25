import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeletePushSubscriptionDto {
  @ApiProperty({ description: 'Endpoint de la suscripción a dar de baja' })
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
