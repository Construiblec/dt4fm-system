import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Idempotencia de los disparos por scheduler. La clave primaria sobre
 * `event_key` es lo que evita reenviar tras un reinicio a mitad de barrido:
 * se inserta con ON CONFLICT DO NOTHING y solo se envía si insertó.
 */
@Entity('notification_dispatch_log')
export class NotificationDispatchLog {
  /** p.ej. `preventive:1234:planning-30d` */
  @PrimaryColumn({ name: 'event_key', type: 'text' })
  eventKey: string;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;
}
