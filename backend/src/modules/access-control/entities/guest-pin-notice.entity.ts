import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * `skipped` solo lo escribe la migración inicial. `cleared`: código borrado de la
 * reserva. `requested`: el CAV renovó el PIN y falta el mensaje.
 */
export type GuestPinNoticeStatus =
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'requested'
  | 'cleared';

/**
 * Un intento de publicar el PIN al huésped. El `doorCode` va por credencial y
 * huella: si el PIN cambia, toca escribirlo de nuevo. Nunca guarda el PIN.
 */
@Entity('guest_pin_notice')
@Index(['credentialId', 'pinFingerprint', 'status'])
@Index('IDX_guest_pin_notice_channel', ['credentialId', 'channel', 'createdAt'])
export class GuestPinNotice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'credential_id', type: 'uuid' })
  credentialId: string;

  @Column({ name: 'guest_stay_id', type: 'uuid', nullable: true })
  guestStayId: string | null;

  @Column({ name: 'pin_fingerprint', type: 'text' })
  pinFingerprint: string;

  /** `hostaway-door-code` (PIN en la reserva) o `hostaway-message` (aviso de renovación). */
  @Column({ name: 'channel', type: 'text' })
  channel: string;

  /** A dónde fue: `reservation:123`, `conversation:123` o la URL del webhook de pruebas. */
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
