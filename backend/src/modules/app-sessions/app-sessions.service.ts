import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import {
  AES_KEY_BYTES,
  decryptAesGcm,
  encryptAesGcm,
} from '../../common/utils/aes-gcm.util';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { BUSINESS_TIMEZONE } from '../push-notifications/scheduler/scheduler.constants';
import { AppSession } from './entities/app-session.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Una sesión recordada que no se usa en este plazo se cierra. */
export const REMEMBER_MS = 30 * DAY_MS;

/**
 * Las no recordadas solo se registran para poder cerrarlas al cambiar la
 * contraseña. openMAINT ya las cierra tras una hora sin uso; la fila se
 * recoge en la limpieza de madrugada.
 */
export const TRANSIENT_MS = DAY_MS;

/**
 * Abrir la app aplaza la caducidad en memoria cada vez, pero en la base como
 * mucho una vez al día por sesión: sobre un plazo de 30 días, perder unas
 * horas tras un reinicio no importa, y cada escritura despierta la base.
 */
export const PERSIST_TOUCH_MS = DAY_MS;

export type IssuedSession = {
  sessionId: string;
  username: string;
  userId: number;
};

/** Lo que hace falta de cada sesión para decidir sin consultar la base. */
type CachedSession = {
  sessionHash: string;
  sessionEnc: string;
  username: string;
  remember: boolean;
  expiresAt: Date;
  /** El `lastUsedAt` que hay escrito en la base. */
  persistedAt: Date;
};

const hashOf = (sessionId: string) =>
  createHash('sha256').update(sessionId).digest('hex');

const lifetime = (remember: boolean) => (remember ? REMEMBER_MS : TRANSIENT_MS);

const toCached = (row: AppSession): CachedSession => ({
  sessionHash: row.sessionHash,
  sessionEnc: row.sessionEnc,
  username: row.username,
  remember: row.remember,
  expiresAt: row.expiresAt,
  persistedAt: row.lastUsedAt,
});

const httpStatus = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;

const reasonOf = (error: unknown) =>
  httpStatus(error) ?? (error as Error)?.message;

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
 * **La tarea de cada 20 minutos no consulta Postgres.** La base está en Neon,
 * que suspende el compute tras 5 minutos sin uso y cobra por tiempo despierto:
 * leer la tabla cada 20 minutos lo mantendría activo las 24 horas. Por eso las
 * sesiones se cargan una vez al arrancar y se decide en memoria; la base solo
 * se toca cuando algo cambia (login, cierre, cambio de contraseña, uso diario,
 * limpieza de vencidas). Vale porque cada entorno corre una sola instancia del
 * backend; con varias, cada una mantendría viva solo lo que ella registró.
 *
 * Sin `APP_SESSION_KEY` no se registra nada y el login funciona como antes:
 * sin «Recordarme» ni cierre de las demás sesiones al cambiar la contraseña.
 */
@Injectable()
export class AppSessionsService implements OnModuleInit {
  private readonly logger = new Logger(AppSessionsService.name);
  private readonly key: Buffer | null;
  private readonly cache = new Map<string, CachedSession>();
  private loading: Promise<void> | null = null;
  private loaded = false;
  private running = false;

  constructor(
    @InjectRepository(AppSession)
    private readonly sessions: Repository<AppSession>,
    private readonly openmaintAuth: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {
    this.key = this.readKey();
  }

  async onModuleInit(): Promise<void> {
    if (!this.key) return;

    try {
      await this.ensureLoaded();
    } catch (error) {
      this.logger.warn(
        `No se pudieron cargar las sesiones registradas (${reasonOf(error)}); se reintenta en la próxima pasada`,
      );
    }
  }

  isEnabled(): boolean {
    return this.key !== null;
  }

  /** Recién emitida por el login. */
  async register(session: IssuedSession, remember: boolean): Promise<void> {
    if (!this.key) return;

    const now = new Date();
    const entry: CachedSession = {
      sessionHash: hashOf(session.sessionId),
      sessionEnc: encryptAesGcm(this.key, session.sessionId),
      username: session.username,
      remember,
      expiresAt: new Date(now.getTime() + lifetime(remember)),
      persistedAt: now,
    };

    await this.sessions.upsert(
      {
        sessionHash: entry.sessionHash,
        sessionEnc: entry.sessionEnc,
        username: entry.username,
        userId: session.userId,
        remember,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: entry.expiresAt,
      },
      ['sessionHash'],
    );

    this.cache.set(entry.sessionHash, entry);
  }

  /** La app la usó: se aplaza su caducidad. */
  async touch(sessionId: string): Promise<void> {
    if (!this.key || !sessionId) return;

    await this.ensureLoaded();

    const entry = this.cache.get(hashOf(sessionId));
    if (!entry) return;

    const now = new Date();
    entry.expiresAt = new Date(now.getTime() + lifetime(entry.remember));

    if (now.getTime() - entry.persistedAt.getTime() < PERSIST_TOUCH_MS) return;

    await this.sessions.update(
      { sessionHash: entry.sessionHash },
      { lastUsedAt: now, expiresAt: entry.expiresAt },
    );
    entry.persistedAt = now;
  }

  /**
   * Cierre de sesión. Se cierra en openMAINT aunque no esté registrada: sin
   * esto seguiría viva hasta una hora después de pulsar «Cerrar sesión».
   */
  async close(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await this.closeInOpenmaint(sessionId);

    if (!this.key) return;

    const sessionHash = hashOf(sessionId);
    this.cache.delete(sessionHash);
    await this.sessions.delete({ sessionHash });
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
      await this.ensureLoaded();

      const keep = keepSessionId ? hashOf(keepSessionId) : null;
      const entries = [...this.cache.values()].filter(
        (entry) => entry.username === username && entry.sessionHash !== keep,
      );

      await this.discard(entries);

      if (entries.length > 0) {
        this.logger.log(`${entries.length} sesión(es) de ${username} cerradas`);
      }

      return entries.length;
    } catch (error) {
      this.logger.error(
        `No se pudieron cerrar las sesiones de ${username}: ${reasonOf(error)}`,
      );
      return 0;
    }
  }

  /**
   * Cada 20 minutos, el intervalo que recomienda el propio openMAINT
   * (`recommendedKeepaliveIntervalSeconds`) para sesiones que caducan a la
   * hora. Solo habla con openMAINT; la base se toca únicamente para borrar las
   * que openMAINT ya no reconoce.
   */
  @Cron('*/20 * * * *')
  async keepAlive(): Promise<void> {
    // El flag se lee aquí y no en el decorador: los decoradores se evalúan al
    // importar el módulo, antes de que ConfigService tenga el .env.
    if (!this.key || !this.schedulerEnabled() || this.running) return;

    this.running = true;

    try {
      await this.ensureLoaded();

      const now = Date.now();
      // Las vencidas no se tocan: las cierra la limpieza de madrugada.
      const due = [...this.cache.values()].filter(
        (entry) => entry.remember && entry.expiresAt.getTime() >= now,
      );
      const gone: CachedSession[] = [];

      for (const entry of due) {
        const sessionId = this.reveal(entry);

        if (!sessionId) {
          gone.push(entry);
          continue;
        }

        try {
          await this.openmaintAuth.keepAlive(sessionId);
        } catch (error) {
          if (isGone(error)) {
            // Un reinicio de openMAINT, o se cerró por otro lado: el móvil
            // tendrá que volver a entrar. No hay forma de revivirla.
            gone.push(entry);
          } else {
            // openMAINT caído: se reintenta en la siguiente pasada, que llega
            // antes de que la hora sin actividad se cumpla.
            this.logger.warn(
              `No se pudo mantener viva una sesión de ${entry.username}: ${reasonOf(error)}`,
            );
          }
        }
      }

      await this.forget(gone);

      if (gone.length > 0) {
        this.logger.log(
          `Keepalive: ${due.length - gone.length} viva(s), ${gone.length} ya cerrada(s) en openMAINT`,
        );
      }
    } catch (error) {
      this.logger.warn(`Keepalive sin completar: ${reasonOf(error)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Una vez al día, de madrugada: cierra en openMAINT las sesiones que
   * cumplieron su plazo sin uso y las borra. Se decide en memoria, así que si
   * no hay ninguna vencida la base ni se entera.
   */
  @Cron('30 4 * * *', { timeZone: BUSINESS_TIMEZONE })
  async purgeExpired(): Promise<void> {
    if (!this.key || !this.schedulerEnabled()) return;

    try {
      await this.ensureLoaded();

      const now = Date.now();
      const expired = [...this.cache.values()].filter(
        (entry) => entry.expiresAt.getTime() < now,
      );

      await this.discard(expired);

      if (expired.length > 0) {
        this.logger.log(`${expired.length} sesión(es) vencida(s) cerradas`);
      }
    } catch (error) {
      this.logger.warn(
        `Limpieza de sesiones sin completar: ${reasonOf(error)}`,
      );
    }
  }

  /**
   * Carga las sesiones registradas una sola vez. Si falla, la siguiente
   * llamada lo vuelve a intentar.
   */
  private ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();

    this.loading ??= this.sessions
      .find()
      .then((rows) => {
        for (const row of rows) {
          // Lo registrado mientras cargaba ya está en memoria y es más nuevo.
          if (!this.cache.has(row.sessionHash)) {
            this.cache.set(row.sessionHash, toCached(row));
          }
        }

        this.loaded = true;
      })
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }

  /** Cierra en openMAINT y las olvida, pase lo que pase con lo primero. */
  private async discard(entries: CachedSession[]): Promise<void> {
    for (const entry of entries) {
      const sessionId = this.reveal(entry);

      if (sessionId) {
        await this.closeInOpenmaint(sessionId);
      }
    }

    await this.forget(entries);
  }

  /** Las saca de memoria y de la base; sin ninguna, no toca la base. */
  private async forget(entries: CachedSession[]): Promise<void> {
    if (entries.length === 0) return;

    const hashes = entries.map((entry) => entry.sessionHash);
    hashes.forEach((hash) => this.cache.delete(hash));

    await this.sessions.delete({ sessionHash: In(hashes) });
  }

  private async closeInOpenmaint(sessionId: string): Promise<void> {
    try {
      await this.openmaintAuth.logout(sessionId);
    } catch (error) {
      // Ya cerrada es justo lo que se quería. Con openMAINT caído deja de
      // mantenerse viva y caduca sola en una hora.
      if (!isGone(error)) {
        this.logger.warn(
          `No se pudo cerrar una sesión en openMAINT: ${reasonOf(error)}`,
        );
      }
    }
  }

  /** `null` si no descifra: clave rotada o fila manipulada. */
  private reveal(entry: CachedSession): string | null {
    if (!this.key) return null;

    try {
      return decryptAesGcm(this.key, entry.sessionEnc, 'sesión cifrada');
    } catch {
      this.logger.warn(
        `Sesión de ${entry.username} indescifrable: se descarta`,
      );
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
