import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Proyección local de una reserva de Hostaway. No la duplica: guarda solo lo
 * que hace falta para emitir credenciales y, más adelante, servir el portal.
 */
@Entity('guest_stay')
@Index(['status', 'accessValidTo'])
@Index(['listingId'])
export class GuestStay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'hostaway_reservation_id', type: 'text', unique: true })
  hostawayReservationId: string;

  /** `listingMapId` de Hostaway. Se conserva para rehacer el mapeo si cambia. */
  @Column({ name: 'listing_id', type: 'text' })
  listingId: string;

  /** Nulo es estado esperado: sin mapeo el PIN funciona, solo falta el nombre. */
  @Column({ name: 'openmaint_unit_id', type: 'int', nullable: true })
  openmaintUnitId: number | null;

  @Column({ name: 'building_id', type: 'int', nullable: true })
  buildingId: number | null;

  @Column({ name: 'guest_name', type: 'text' })
  guestName: string;

  @Column({ name: 'guest_email', type: 'text', nullable: true })
  guestEmail: string | null;

  /** Segundo factor del canje del enlace, cuando exista el portal. */
  @Column({ name: 'guest_last_name_hash', type: 'text', nullable: true })
  guestLastNameHash: string | null;

  @Column({ name: 'arrival_date', type: 'date' })
  arrivalDate: string;

  @Column({ name: 'departure_date', type: 'date' })
  departureDate: string;

  /** Vigencia real con los márgenes ya aplicados, para que credencial y panel no discrepen. */
  @Column({ name: 'access_valid_from', type: 'timestamptz' })
  accessValidFrom: Date;

  @Column({ name: 'access_valid_to', type: 'timestamptz' })
  accessValidTo: Date;

  @Column({ name: 'status', type: 'text' })
  status: 'pending' | 'active' | 'completed' | 'cancelled';

  /** Incrementarlo invalidará todos los enlaces emitidos. Ver el portal, diferido. */
  @Column({ name: 'token_version', type: 'int', default: 1 })
  tokenVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
