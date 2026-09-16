import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Código corto que se canjea por el token del portal (`/g/<código>`).
 * Solo se guarda el hash: un volcado de la tabla no entrega enlaces usables.
 */
@Entity('guest_short_link')
export class GuestShortLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('UQ_guest_short_link_code_hash', { unique: true })
  @Column({ name: 'code_hash', type: 'text' })
  codeHash: string;

  @Column({ name: 'guest_stay_id', type: 'uuid' })
  guestStayId: string;

  @Column({ name: 'token_version', type: 'int' })
  tokenVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
