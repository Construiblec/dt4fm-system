import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Una sesión de openMAINT emitida por el login de la app.
 *
 * Se registran todas, no solo las recordadas: al cambiar la contraseña hay que
 * cerrar las de los demás dispositivos, y openMAINT no sirve para encontrarlas
 * (las de `scope=service`, que son las de la app, no salen en `GET /sessions`).
 *
 * El id va cifrado porque hace falta en claro para mantenerla viva y para
 * cerrarla. Lo que se busca, cuando llega en una cabecera, es su huella.
 */
@Entity('app_session')
@Index(['sessionHash'], { unique: true })
@Index(['username'])
@Index(['expiresAt'])
export class AppSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** sha256 del id de sesión: basta, el id ya es aleatorio y largo. */
  @Column({ name: 'session_hash', type: 'text' })
  sessionHash: string;

  @Column({ name: 'session_enc', type: 'text' })
  sessionEnc: string;

  @Column({ name: 'username', type: 'text' })
  username: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  /** «Mantener la sesión iniciada»: solo estas se mantienen vivas. */
  @Column({ name: 'remember', type: 'boolean' })
  remember: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt: Date;

  /** Pasada esta fecha se cierra en openMAINT. Cada uso la aplaza. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
