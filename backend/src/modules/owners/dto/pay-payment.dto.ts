import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class PayPaymentDto {
  // IDs de los pagos a procesar (uno o varios)
  @ApiProperty({ description: 'Listado de IDs de pago a registrar', type: [Number], example: [123, 124] })
  @IsArray()
  @IsNotEmpty()
  paymentIds: number[];

  // Método de pago: 'transfer' | 'card'
  @ApiProperty({ description: 'Método de pago utilizado', example: 'transfer', enum: ['transfer', 'card'] })
  @IsString()
  @IsNotEmpty()
  method: string;

  // Fecha de pago en formato yyyy-MM-dd
  @ApiProperty({ description: 'Fecha en la que se realizó el pago (YYYY-MM-DD)', example: '2026-06-03' })
  @IsString()
  @IsNotEmpty()
  paymentDate: string;

  @ApiPropertyOptional({ description: 'Comentarios o notas del pago', example: 'Pago correspondiente al mes de mayo' })
  @IsString()
  @IsOptional()
  notes?: string;
}
