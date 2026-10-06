import { Column, Entity, PrimaryColumn } from 'typeorm';

/** `open`: hubo un pulso desde `ready`; los plazos salen de `pulsedAt` y de los tiempos del edificio. */
export type GatePhase = 'ready' | 'open' | 'uncertain';

/**
 * Fase de interfaz de cada barrera vehicular, compartida por huéspedes y
 * Supervisor CAV. Solo conoce los pulsos que mandó el backend: no es el
 * estado de la barrera, que no tiene sensor.
 */
@Entity('vehicular_gate_phase')
export class VehicularGatePhase {
  @PrimaryColumn({ name: 'device_id', type: 'text' })
  deviceId: string;

  @Column({ name: 'building_id', type: 'int' })
  buildingId: number;

  @Column({ name: 'phase', type: 'text' })
  phase: GatePhase;

  /** Hora del último pulso según el backend, al recibir la respuesta. */
  @Column({ name: 'pulsed_at', type: 'timestamptz', nullable: true })
  pulsedAt: Date | null;

  @Column({ name: 'opened_by_stay_id', type: 'uuid', nullable: true })
  openedByStayId: string | null;

  @Column({ name: 'opened_by_username', type: 'text', nullable: true })
  openedByUsername: string | null;

  /** La orden que dejó la fase así; nula si la fijó a mano el Supervisor CAV. */
  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  /** Quién la liberó a mano tras un pulso sin confirmar. */
  @Column({ name: 'resolved_by', type: 'text', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
