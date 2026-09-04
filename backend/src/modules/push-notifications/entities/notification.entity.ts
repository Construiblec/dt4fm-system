import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// Historial de notificaciones: una fila por destinatario
@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  /** Tipo estable, p.ej. `corrective.opened`. Ver notification-types.ts */
  @Column({ name: 'type', type: 'text' })
  type: string;

  @Column({ name: 'title', type: 'text' })
  title: string;

  @Column({ name: 'body', type: 'text' })
  body: string;

  @Column({ name: 'deep_link', type: 'text', nullable: true })
  deepLink: string | null;

  @Column({ name: 'entity_kind', type: 'text', nullable: true })
  entityKind: string | null;

  @Column({ name: 'entity_id', type: 'text', nullable: true })
  entityId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
