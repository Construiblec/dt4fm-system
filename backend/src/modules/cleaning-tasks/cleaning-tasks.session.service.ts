import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { describeError } from '../../common/logging/describe-error.util';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';

/**
 * Sesión de servicio compartida con OpenMAINT (credenciales del .env), usada por
 * limpiezas y mantenimiento. Se renueva sola al expirar.
 */
@Injectable()
export class CleaningTasksSessionService implements OnModuleInit {
  private readonly logger = new Logger(CleaningTasksSessionService.name);
  private sessionId: string | null = null;
  private sessionExpiresAt: number = 0;
  private readonly SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutos
  private readonly LOGIN_TIMEOUT_MS = 15_000;
  // Insistir con una credencial rechazada bloquea la cuenta de servicio.
  private readonly COOLDOWN_MS = 5 * 60 * 1000;
  private refreshing: Promise<void> | null = null;
  private coolingDownUntil = 0;

  constructor(
    private readonly client: OpenmaintClient,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.refreshSession();
  }

  /**
   * Obtiene el session ID, refrescando automáticamente si expiró
   */
  async getSessionId(): Promise<string> {
    const now = Date.now();

    // Si no hay sesión o expiró, refrescar
    if (!this.sessionId || now >= this.sessionExpiresAt) {
      // Rutina (la sesión dura 30 min), no un aviso.
      this.logger.debug('Sesión de servicio vencida o ausente: se renueva');
      await this.refreshSession();
    }

    return this.sessionId || '';
  }

  /** El último login fue rechazado (401/403) y aún no se vuelve a intentar. */
  isCoolingDown(): boolean {
    return Date.now() < this.coolingDownUntil;
  }

  /**
   * Fuerza el refresco de la sesión. Nunca rechaza; las llamadas simultáneas
   * comparten un mismo login.
   */
  async refreshSession(): Promise<void> {
    if (this.refreshing) {
      return this.refreshing;
    }

    if (this.isCoolingDown()) {
      this.logger.debug('Login de servicio en enfriamiento: no se intenta');
      return;
    }

    this.refreshing = this.login().finally(() => {
      this.refreshing = null;
    });

    return this.refreshing;
  }

  private async login(): Promise<void> {
    try {
      const username =
        this.configService.get<string>('OPENMAINT_USERNAME') ?? '';
      const password =
        this.configService.get<string>('OPENMAINT_PASSWORD') ?? '';

      const response = (await this.client.post(
        '/sessions?scope=service&returnId=true',
        { username, password },
        undefined,
        { timeout: this.LOGIN_TIMEOUT_MS },
      )) as { data?: { _id?: string } } | undefined;

      this.sessionId = response?.data?._id ?? null;
      this.sessionExpiresAt = Date.now() + this.SESSION_DURATION_MS;

      if (this.sessionId) {
        this.coolingDownUntil = 0;
        // Ni el id ni un trozo: es la credencial de la cuenta de servicio, y
        // los primeros caracteres que se escribían aquí reducían lo que queda
        // por adivinar.
        this.logger.log(
          `Sesión de servicio iniciada, válida hasta ${new Date(this.sessionExpiresAt).toLocaleTimeString()}`,
        );
      } else {
        this.logger.error(
          'openMAINT no devolvió el id de la sesión de servicio',
        );
      }
    } catch (error) {
      this.logger.error(
        `No se pudo iniciar la sesión de servicio en openMAINT — ${describeError(error)}`,
      );
      this.sessionId = null;
      this.sessionExpiresAt = 0;

      const status = isAxiosError(error) ? error.response?.status : undefined;

      if (status === 401 || status === 403) {
        this.coolingDownUntil = Date.now() + this.COOLDOWN_MS;
        this.logger.warn(
          `Credencial de servicio rechazada: sin nuevos intentos hasta ${new Date(this.coolingDownUntil).toLocaleTimeString()}`,
        );
      }
    }
  }

  /**
   * Invalida la sesión actual (fuerza refresco en próxima llamada)
   */
  invalidateSession(): void {
    // Quien la invalida (un 401) ya dejó su propia línea de aviso.
    this.logger.debug(
      'Sesión de servicio invalidada: se renueva en la próxima llamada',
    );
    this.sessionId = null;
    this.sessionExpiresAt = 0;
  }
}
