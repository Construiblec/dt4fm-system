import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type {
  AccessIotErrorCode,
  DeviceScope,
  DoorAction,
  TriggerOutcome,
} from '../access-iot.types';

export type RemoteOpenActorType = 'guest' | 'staff';
/** `opened` y `closed` solo aparecen en filas anteriores a `trigger`: son historial. */
export type RemoteOpenStatus =
  | 'attempted'
  | TriggerOutcome
  | 'opened'
  | 'closed';

/**
 * Un pulso remoto por barrera; `action` es la fase de interfaz (Abrir o
 * Cerrar). Se escribe `attempted` antes de llamar a la VPS: si el proceso
 * muere a medias, la fila queda como rastro. Es el único registro de quién pulsó.
 */
@Entity('remote_open_request')
@Index(['requestId', 'deviceId'], { unique: true })
@Index(['deviceId', 'requestedAt'])
@Index(['guestStayId', 'requestedAt'])
export class RemoteOpenRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Lo genera el cliente por toque: repetir la petición no repite el pulso. */
  @Column({ name: 'request_id', type: 'uuid' })
  requestId: string;

  @Column({ name: 'device_id', type: 'text' })
  deviceId: string;

  @Column({ name: 'building_id', type: 'int' })
  buildingId: number;

  @Column({ name: 'device_scope', type: 'text' })
  deviceScope: DeviceScope;

  @Column({ name: 'action', type: 'text' })
  action: DoorAction;

  @Column({ name: 'actor_type', type: 'text' })
  actorType: RemoteOpenActorType;

  @Column({ name: 'guest_stay_id', type: 'uuid', nullable: true })
  guestStayId: string | null;

  @Column({ name: 'actor_username', type: 'text', nullable: true })
  actorUsername: string | null;

  @Column({ name: 'status', type: 'text' })
  status: RemoteOpenStatus;

  @Column({ name: 'error_code', type: 'text', nullable: true })
  errorCode: AccessIotErrorCode | null;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
