import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SubjectType = 'guest' | 'tenant' | 'employee';
export type CredentialScope = 'pedestrian' | 'vehicular' | 'both';
export type CredentialStatus = 'pending' | 'active' | 'revoked' | 'expired';
export type SyncState = 'pending' | 'synced' | 'failed';

/** Resultado por dispositivo de la última escritura, tal como lo devuelve la VPS. */
export interface SyncDetailDevice {
  deviceId: string;
  state: 'written' | 'unreachable' | 'failed';
  employeeNo?: string;
  error?: string | null;
  at?: string;
}

/**
 * Un permiso de acceso: un PIN, para un sujeto, en un edificio, con una ventana
 * de validez. Es la autoridad; la VPS y los terminales solo la ejecutan.
 */
@Entity('access_credential')
@Index(['subjectType', 'subjectRef'])
@Index(['status', 'validTo'])
@Index(['guestStayId'])
export class AccessCredential {
  /**
   * Viaja a la VPS como identificador del permiso: de él deriva el `employeeNo`
   * del terminal, así que reenviar la misma escritura es idempotente.
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subject_type', type: 'text' })
  subjectType: SubjectType;

  /** `hostawayReservationId`, `Tenant._id` o `Employee._id`: no comparten formato. */
  @Column({ name: 'subject_ref', type: 'text' })
  subjectRef: string;

  /** Denormalizado a propósito: la auditoría sigue legible si la reserva desaparece. */
  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @Column({ name: 'scope', type: 'text' })
  scope: CredentialScope;

  /** `Building._id` de openMAINT. No es clave foránea: openMAINT es externo. */
  @Column({ name: 'building_id', type: 'int' })
  buildingId: number;

  /** Contexto para soporte y para el portal; no decide dónde se coloca la credencial. */
  @Column({ name: 'openmaint_unit_id', type: 'int', nullable: true })
  openmaintUnitId: number | null;

  /** AES-256-GCM en `iv:tag:ciphertext`. Cifrado y no hasheado porque el portal lo mostrará. */
  @Column({ name: 'pin_ciphertext', type: 'text' })
  pinCiphertext: string;

  /** HMAC del PIN: unicidad y enfriamiento sin descifrar nada. */
  @Column({ name: 'pin_fingerprint', type: 'text' })
  pinFingerprint: string;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_to', type: 'timestamptz' })
  validTo: Date;

  @Column({ name: 'status', type: 'text' })
  status: CredentialStatus;

  @Column({ name: 'revoked_reason', type: 'text', nullable: true })
  revokedReason: string | null;

  /** De dónde salió: `hostaway-webhook`, `hostaway-sweep`, `manual:<username>`. */
  @Column({ name: 'issued_by', type: 'text' })
  issuedBy: string;

  @Column({ name: 'guest_stay_id', type: 'uuid', nullable: true })
  guestStayId: string | null;

  @Column({ name: 'sync_state', type: 'text', default: 'pending' })
  syncState: SyncState;

  @Column({ name: 'sync_attempts', type: 'int', default: 0 })
  syncAttempts: number;

  @Column({ name: 'sync_detail', type: 'jsonb', nullable: true })
  syncDetail: SyncDetailDevice[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
