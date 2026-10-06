import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { LiveSessionErrorCode } from '../../access-control/access-iot.types';

export type LiveViewStatus = 'requested' | 'issued' | 'failed';

/**
 * Una visualización en vivo por clic. Se escribe `requested` antes de pedir la
 * sesión a la VPS, que no guarda quién vio qué: esta tabla es el único registro.
 * Nunca lleva el `ticket` ni la credencial TURN.
 */
@Entity('live_view_request')
@Index(['requestId'], { unique: true })
@Index(['cameraId', 'requestedAt'])
@Index(['actorUsername', 'requestedAt'])
export class LiveViewRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** El mismo `requestId` aparece en el log de la VPS: une los dos registros. */
  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'camera_id', type: 'text' })
  cameraId: string;

  /** `Building._id` de openMAINT; nulo si la cámara aún no estaba en el catálogo. */
  @Column({ name: 'building_id', type: 'int', nullable: true })
  buildingId: number | null;

  @Column({ name: 'actor_username', type: 'text' })
  actorUsername: string;

  @Column({ name: 'status', type: 'text' })
  status: LiveViewStatus;

  @Column({ name: 'error_code', type: 'text', nullable: true })
  errorCode: LiveSessionErrorCode | 'internal_error' | null;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
