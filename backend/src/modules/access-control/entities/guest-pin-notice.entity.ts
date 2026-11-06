import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** `skipped` solo lo escribe la migración: credenciales anteriores al envío del PIN. */
export type GuestPinNoticeStatus = 'sent' | 'failed' | 'skipped';

/**
 * Un intento de avisar al huésped de su PIN. Va por credencial y huella: si el
 * PIN cambia, la huella también y toca avisar de nuevo. Nunca guarda el PIN.
 */
@Entity('guest_pin_notice')
@Index(['credentialId', 'pinFingerprint', 'status'])
export class GuestPinNotice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'credential_id', type: 'uuid' })
  credentialId: string;

  @Column({ name: 'guest_stay_id', type: 'uuid', nullable: true })
  guestStayId: string | null;

  @Column({ name: 'pin_fingerprint', type: 'text' })
  pinFingerprint: string;

  /** `hostaway-message`; en el futuro, `email` para las reservas directas. */
  @Column({ name: 'channel', type: 'text' })
  channel: string;

  /** A dónde fue, p. ej. `conversation:123`. */
  @Column({ name: 'target', type: 'text' })
  target: string;

  @Column({ name: 'status', type: 'text' })
  status: GuestPinNoticeStatus;

  @Column({ name: 'http_status', type: 'int', nullable: true })
  httpStatus: number | null;

  @Column({ name: 'error', type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
