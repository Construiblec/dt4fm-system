import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Lo último que Hostaway dijo de la reserva de una limpieza. Si no cambió desde
 * entonces, la diferencia con la limpieza la puso una persona y se respeta.
 */
@Entity('cleaning_sync_baseline')
export class CleaningSyncBaseline {
  // bigint llega como texto.
  @PrimaryColumn({ name: 'task_id', type: 'bigint' })
  taskId: string;

  @Column({ name: 'checkout_date', type: 'text' })
  checkoutDate: string;

  @Column({ name: 'listing_id', type: 'text' })
  listingId: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
