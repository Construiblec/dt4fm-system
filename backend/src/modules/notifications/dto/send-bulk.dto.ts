import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsString,
  ArrayMinSize,
} from 'class-validator';

/**
 * Cuerpo para "enviar comunicado masivo ahora".
 * Lo consume la página personalizada de openMAINT.
 *
 * La página personalizada es responsable de resolver los destinatarios
 * (edificio + alcance) y enviar la lista de emails ya resuelta.
 * El backend solo renderiza la plantilla y envía — no conoce edificios
 * ni relaciones de openMAINT.
 *
 * - templateId:  ID de la card EmailTemplate en openMAINT
 * - recipients:  lista de emails ya resuelta por la página personalizada
 * - extraVars:   variables globales adicionales para el render (opcional)
 */
export class SendBulkDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe haber al menos un destinatario' })
  @IsEmail({}, { each: true, message: 'Cada destinatario debe ser un email válido' })
  recipients: string[];

  @IsOptional()
  @IsObject()
  extraVars?: Record<string, string>;
}
