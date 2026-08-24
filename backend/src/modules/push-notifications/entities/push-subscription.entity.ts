import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Una suscripción push por dispositivo. `endpoint` es la identidad natural:
 * pertenece al navegador, no a la persona, así que en dispositivos compartidos
 * el alta reasigna el usuario en lugar de insertar una fila nueva.
 */
@Entity('push_subscriptions')
@Index(['role'])
@Index(['employeeId'])
@Index(['cleaningEmployeeId'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ name: 'username', type: 'text' })
  username: string;

  /** Resuelto contra OpenMAINT al suscribirse; nunca el header `x-role`. */
  @Column({ name: 'role', type: 'text' })
  role: string;

  /** Employee vía `LoginUser`: direcciona correctivos y preventivos. */
  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  /** Employee vía `PortalUsername`: direcciona limpieza. */
  @Column({ name: 'cleaning_employee_id', type: 'int', nullable: true })
  cleaningEmployeeId: number | null;

  @Column({ name: 'endpoint', type: 'text', unique: true })
  endpoint: string;

  @Column({ name: 'p256dh', type: 'text' })
  p256dh: string;

  @Column({ name: 'auth', type: 'text' })
  auth: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;

  @Column({ name: 'failure_count', type: 'int', default: 0 })
  failureCount: number;
}