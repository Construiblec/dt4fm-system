import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MassSendTemplateDto {
  @ApiProperty({
    description: 'Asunto del correo.',
    example: 'Notificacion Mantenimientos',
  })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    description: 'Cuerpo HTML del correo.',
    example: 'Esto es una prueba de envio masivo masivo',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}

/**
 * Cuerpo para POST /notifications/mass-send.
 *
 * La página personalizada de openMAINT construye este JSON
 * tomando Subject y Body directamente de la card EmailTemplate
 * y agregando la lista de destinatarios ya resuelta.
 */
export class MassSendDto {
  @ApiProperty({
    description:
      'Plantilla con subject y body del comunicado a enviar.',
    type: MassSendTemplateDto,
    example: {
      subject: 'Notificacion Mantenimientos',
      body: 'Esto es una prueba de envio masivo masivo',
    },
  })
  @ValidateNested()
  @Type(() => MassSendTemplateDto)
  template: MassSendTemplateDto;

  @ApiProperty({
    description:
      'Lista de correos destinatarios ya resuelta por la página de openMAINT. ' +
      'Se deduplica automáticamente. Debe contener al menos un email válido.',
    example: ['propietario@ejemplo.com', 'arrendatario@ejemplo.com'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe haber al menos un destinatario' })
  @IsEmail({}, { each: true, message: 'Cada destinatario debe ser un email válido' })
  recipients: string[];

  @ApiPropertyOptional({
    description:
      'Variables adicionales para reemplazar en Subject o Body (formato {{clave}}). ' +
      'La variable "email" se inyecta automáticamente por destinatario.',
    example: { nombre: 'Edificio Central', periodo: 'Junio 2025' },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  extraVars?: Record<string, string>;
}
