/**
 * Contrato de transporte de correo.
 *
 * Cualquier proveedor (SMTP genérico, Brevo, Mailtrap, SES, etc.) debe
 * implementar esta interfaz. La lógica de negocio (NotificationsService)
 * y el motor de envío (MailerService) dependen SOLO de este contrato,
 * nunca de un proveedor concreto.
 *
 * Para cambiar de proveedor basta con:
 *   1. Crear una nueva clase que implemente MailProvider.
 *   2. Registrarla en el factory de notifications.module.ts.
 *   3. Ajustar las variables de entorno.
 *
 * Ningún otro archivo necesita cambiar.
 */

export interface MailMessage {
  /** Destinatario único ya resuelto y validado. */
  to: string;
  subject: string;
  /** Cuerpo en HTML ya renderizado (variables reemplazadas). */
  html: string;
  /** Cuerpo en texto plano opcional (fallback para clientes sin HTML). */
  text?: string;
  /** Remitente opcional; si se omite, el proveedor usa su valor por defecto. */
  from?: string;
  /** Responder-a opcional. */
  replyTo?: string;
}

export interface MailSendResult {
  to: string;
  success: boolean;
  /** Identificador del mensaje devuelto por el proveedor, si aplica. */
  messageId?: string;
  /** Mensaje de error legible cuando success = false. */
  error?: string;
}

/**
 * Token de inyección para el proveedor de correo activo.
 * Se resuelve en notifications.module.ts según la configuración.
 */
export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailProvider {
  /** Nombre del proveedor, útil para logs y diagnóstico. */
  readonly name: string;

  /** Envía un único mensaje. No debe lanzar: devuelve el resultado. */
  send(message: MailMessage): Promise<MailSendResult>;

  /**
   * Verifica que la configuración/conexión del proveedor sea válida.
   * Útil para un endpoint de health o diagnóstico.
   */
  verify(): Promise<boolean>;
}
