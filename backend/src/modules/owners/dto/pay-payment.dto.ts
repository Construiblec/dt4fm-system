import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class PayPaymentDto {
  // IDs de los pagos a procesar (uno o varios)
  @IsArray()
  @IsNotEmpty()
  paymentIds: number[];

  // Método de pago: 'transfer' | 'card'
  @IsString()
  @IsNotEmpty()
  method: string;

  // Fecha de pago en formato yyyy-MM-dd
  @IsString()
  @IsNotEmpty()
  paymentDate: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
