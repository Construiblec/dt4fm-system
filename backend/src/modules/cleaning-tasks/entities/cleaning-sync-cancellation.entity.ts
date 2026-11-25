import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Limpiezas que canceló la sincronización: solo estas se vuelven a crear si la reserva revive. */
@Entity('cleaning_sync_cancellation')
export class CleaningSyncCancellation {
  // bigint llega como texto.
  @PrimaryColumn({ name: 'task_id', type: 'bigint' })
  taskId: string;

  @Column({ name: 'reservation_id', type: 'text' })
  reservationId: string;

  /** `false` = escritura aún no confirmada: no cuenta como nuestra. */
  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @CreateDateColumn({ name: 'cancelled_at', type: 'timestamptz' })
  cancelledAt: Date;
}
