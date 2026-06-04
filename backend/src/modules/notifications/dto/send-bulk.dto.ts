import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
} from 'class-validator';
import { RecipientScope } from '../recipient-scope.enum';

/**
 * Cuerpo para "enviar comunicado masivo ahora".
 * Lo consume la página personalizada de openMAINT.
 *
 * - scope:       a quién enviar (todos / propietarios / arrendatarios)
 * - templateId:  card de la clase de plantillas en openMAINT a utilizar
 * - extraVars:   variables adicionales globales para el render, opcionales
 *                (las variables por destinatario, como su nombre, las
 *                resuelve el backend a partir de cada Tenant)
 */
export class SendBulkDto {
  @IsEnum(RecipientScope, {
    message: 'scope debe ser uno de: all, owners, tenants',
  })
  scope: RecipientScope;

  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsOptional()
  @IsObject()
  extraVars?: Record<string, string>;
}
