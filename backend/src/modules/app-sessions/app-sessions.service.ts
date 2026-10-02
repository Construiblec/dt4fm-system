import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  AES_KEY_BYTES,
  decryptAesGcm,
  encryptAesGcm,
} from '../../common/utils/aes-gcm.util';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { AppSession } from './entities/app-session.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Una sesión recordada que no se usa en este plazo se cierra. */
export const REMEMBER_MS = 30 * DAY_MS;

/**
 * Las no recordadas solo se registran para poder cerrarlas al cambiar la
 * contraseña. openMAINT ya las cierra tras una hora sin uso; la fila se
 * recoge al día siguiente.
 */
export const TRANSIENT_MS = DAY_MS;

/** Cuántas sesiones vencidas se procesan por pasada. */
const SWEEP_BATCH = 200;

export type IssuedSession = {
  sessionId: string;
  username: string;
  userId: number;
};

const hashOf = (sessionId: string) =>
  createHash('sha256').update(sessionId).digest('hex');

const lifetime = (remember: boolean) => (remember ? REMEMBER_MS : TRANSIENT_MS);

const httpStatus = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;

/** openMAINT ya no reconoce la sesión: caducó o la cerró otro. */
const isGone = (error: unknown) =>
  [401, 403, 404].includes(httpStatus(error) ?? 0);

/**
 * Sesiones de la app que el backend mantiene vivas y sabe cerrar.
 *
 * openMAINT cierra una sesión tras una hora sin actividad. Para que el móvil no
 * pida la contraseña cada mañana, las recordadas se tocan desde aquí cada 20
 * minutos con el keepalive de openMAINT. El móvil guarda una sesión normal del
 * usuario: no se le entrega nada con más permisos que los suyos.
 *
 * Sin `APP_SESSION_KEY` no se registra nada y el login funciona como antes:
 * sin «Recordarme» ni cierre de las demás sesiones al cambiar la contraseña.
 */
@Injectable()
export class AppSessionsService {
  private readonly logger = new Logger(AppSessionsService.name);
  private readonly key: Buffer | null;
  private running = false;

  constructor(
    @InjectRepository(AppSession)
    private readonly sessions: Repository<AppSession>,
    private readonly openmaintAuth: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {
    this.key = this.readKey();
  }

  isEnabled(): boolean {
    return this.key !== null;
  }

  /** Recién emitida por el login. */
  async register(session: IssuedSession, remember: boolean): Promise<void> {
    if (!this.key) return;

    const now = new Date();

    await this.sessions.upsert(
      {
        sessionHash: hashOf(session.sessionId),
        sessionEnc: encryptAesGcm(this.key, session.sessionId),
        username: session.username,
        userId: session.userId,
        remember,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + lifetime(remember)),
      },
      ['sessionHash'],
    );
  }

  /** La app la usó: se aplaza su caducidad. */
  async touch(sessionId: string): Promise<void> {
    if (!this.key || !sessionId) return;

    const row = await this.sessions.findOne({
      where: { sessionHash: hashOf(sessionId) },
    });

    if (!row) return;

    const now = new Date();
    row.lastUsedAt = now;
    row.expiresAt = new Date(now.getTime() + lifetime(row.remember));

    await this.sessions.save(row);
  }

  /**
   * Cierre de sesión. Se cierra en openMAINT aunque no esté registrada: sin
   * esto seguiría viva hasta una hora después de pulsar «Cerrar sesión».
   */
  async close(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await this.closeInOpenmaint(sessionId);

    if (this.key) {
      await this.sessions.delete({ sessionHash: hashOf(sessionId) });
    }
  }

  /**
   * Tras un cambio de contraseña: cierra las sesiones de la app de ese usuario
   * en todos los dispositivos, menos `keepSessionId`, la de quien la cambió.
   *
   * Nunca lanza: cuando se llama, la contraseña ya cambió, y un fallo aquí no
   * puede convertir eso en un error para el usuario. Devuelve cuántas cerró.
   */
  async closeAllForUser(
    username: string,
    keepSessionId?: string,
  ): Promise<number> {
    if (!this.key || !username) return 0;

    try {
      const keep = keepSessionId ? hashOf(keepSessionId) : null;
      const rows = (await this.sessions.find({ where: { username } })).filter(
        (row) => row.sessionHash !== keep,
      );

      for (const row of rows) {
        await this.discard(row);
      }

      if (rows.length > 0) {
        this.logger.log(`${rows.length} sesión(es) de ${username} cerradas`);
      }

      return rows.length;
    } catch (error) {
      this.logger.error(
        `No se pudieron cerrar las sesiones de ${username}: ${(error as Error)?.message}`,
      );
      return 0;
    }
  }

  /**
   * Cada 20 minutos, el intervalo que recomienda el propio openMAINT
   * (`recommendedKeepaliveIntervalSeconds`) para sesiones que caducan a la
   * hora. Primero cierra las vencidas y luego toca las recordadas.
   */
  @Cron('*/20 * * * *')
  async keepAlive(): Promise<void> {
    // El flag se lee aquí y no en el decorador: los decoradores se evalúan al
    // importar el módulo, antes de que ConfigService tenga el .env.
    if (!this.key || !this.schedulerEnabled() || this.running) return;

    this.running = true;

    try {
      const expired = await this.sweepExpired();
      const { alive, gone } = await this.pingRemembered();

      if (expired > 0 || gone > 0) {
        this.logger.log(
          `Keepalive: ${alive} viva(s), ${gone} ya cerrada(s) en openMAINT, ${expired} vencida(s)`,
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async sweepExpired(): Promise<number> {
    const expired = await this.sessions.find({
      where: { expiresAt: LessThan(new Date()) },
      take: SWEEP_BATCH,
    });

    for (const row of expired) {
      await this.discard(row);
    }

    return expired.length;
  }

  private async pingRemembered(): Promise<{ alive: number; gone: number }> {
    // Las vencidas que no entraron en el lote de la limpieza tampoco se tocan.
    const rows = await this.sessions.find({
      where: { remember: true, expiresAt: MoreThanOrEqual(new Date()) },
    });
    let alive = 0;
    let gone = 0;

    for (const row of rows) {
      const sessionId = this.reveal(row);

      if (!sessionId) {
        await this.sessions.delete({ id: row.id });
        gone += 1;
        continue;
      }

      try {
        await this.openmaintAuth.keepAlive(sessionId);
        alive += 1;
      } catch (error) {
        if (isGone(error)) {
          // Un reinicio de openMAINT, o se cerró por otro lado: el móvil
          // tendrá que volver a entrar. No hay forma de revivirla.
          await this.sessions.delete({ id: row.id });
          gone += 1;
        } else {
          // openMAINT caído: se reintenta en la siguiente pasada, que llega
          // antes de que la hora sin actividad se cumpla.
          this.logger.warn(
            `No se pudo mantener viva una sesión de ${row.username}: ${httpStatus(error) ?? (error as Error)?.message}`,
          );
        }
      }
    }

    return { alive, gone };
  }

  /** Cierra en openMAINT y borra la fila, pase lo que pase con lo primero. */
  private async discard(row: AppSession): Promise<void> {
    const sessionId = this.reveal(row);

    if (sessionId) {
      await this.closeInOpenmaint(sessionId);
    }

    await this.sessions.delete({ id: row.id });
  }

  private async closeInOpenmaint(sessionId: string): Promise<void> {
    try {
      await this.openmaintAuth.logout(sessionId);
    } catch (error) {
      // Ya cerrada es justo lo que se quería. Con openMAINT caído deja de
      // mantenerse viva y caduca sola en una hora.
      if (!isGone(error)) {
        this.logger.warn(
          `No se pudo cerrar una sesión en openMAINT: ${httpStatus(error) ?? (error as Error)?.message}`,
        );
      }
    }
  }

  /** `null` si no descifra: clave rotada o fila manipulada. */
  private reveal(row: AppSession): string | null {
    if (!this.key) return null;

    try {
      return decryptAesGcm(this.key, row.sessionEnc, 'sesión cifrada');
    } catch {
      this.logger.warn(`Sesión de ${row.username} indescifrable: se descarta`);
      return null;
    }
  }

  private schedulerEnabled(): boolean {
    return (
      this.configService.get<string>('APP_SESSION_KEEPALIVE_ENABLED') === 'true'
    );
  }

  /** Ausente o con longitud incorrecta: el registro queda desactivado. */
  private readKey(): Buffer | null {
    const raw = this.configService.get<string>('APP_SESSION_KEY')?.trim() ?? '';

    if (!raw) {
      this.logger.warn(
        'APP_SESSION_KEY no está definida: no se recuerdan sesiones ni se ' +
          'cierran las demás al cambiar la contraseña',
      );
      return null;
    }

    const key = Buffer.from(raw, 'base64');

    if (key.length !== AES_KEY_BYTES) {
      this.logger.error(
        `APP_SESSION_KEY debe decodificar a ${AES_KEY_BYTES} bytes en base64; llegaron ${key.length}`,
      );
      return null;
    }

    return key;
  }
}
