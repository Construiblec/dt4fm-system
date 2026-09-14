import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type GuestLinkDeliveryStatus = 'sent' | 'failed';

/**
 * Un intento de entregar el enlace del portal a un huésped.
 *
 * Es el registro que hace dos cosas que sin él serían imposibles: **no
 * reenviar** el enlace cada vez que Hostaway modifica la reserva, y **ver qué
 * falló** cuando un huésped dice que no le llegó nada.
 *
 * Referencia a `guest_stay` con clave foránea, pero la referencia sale de esta
 * tabla: la de Fernando no se toca.
 */
@Entity('guest_link_delivery')
@Index(['guestStayId', 'status'])
export class GuestLinkDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'guest_stay_id', type: 'uuid' })
  guestStayId: string;

  /**
   * Con qué generación de enlace se envió. Si `token_version` sube después,
   * este envío ya no cuenta como vigente y toca reenviar.
   */
  @Column({ name: 'token_version', type: 'int' })
  tokenVersion: number;

  /** `webhook`, y en el futuro `email`, `whatsapp`… */
  @Column({ name: 'channel', type: 'text' })
  channel: string;

  /** A dónde fue: URL, correo o número, según el canal. */
  @Column({ name: 'target', type: 'text' })
  target: string;

  @Column({ name: 'status', type: 'text' })
  status: GuestLinkDeliveryStatus;

  @Column({ name: 'http_status', type: 'int', nullable: true })
  httpStatus: number | null;

  @Column({ name: 'error', type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
