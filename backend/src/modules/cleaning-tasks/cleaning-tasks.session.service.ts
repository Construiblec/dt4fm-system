import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeError } from '../../common/logging/describe-error.util';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';

/**
 * Servicio de sesión interna exclusivo para el módulo CleaningTasks.
 * Maneja su propia sesión con OpenMAINT usando credenciales del .env.
 * Auto-refresca la sesión cuando expira.
 */
@Injectable()
export class CleaningTasksSessionService implements OnModuleInit {
  private readonly logger = new Logger(CleaningTasksSessionService.name);
  private sessionId: string | null = null;
  private sessionExpiresAt: number = 0;
  private readonly SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutos

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

  /**
   * Fuerza el refresco de la sesión
   */
  async refreshSession(): Promise<void> {
    const username =
      this.configService.get<string>('OPENMAINT_USERNAME') || 'admin';
    const password =
      this.configService.get<string>('OPENMAINT_PASSWORD') || 'admin';

    try {
      const response = await this.client.post(
        '/sessions?scope=service&returnId=true',
        { username, password },
      );

      this.sessionId = response?.data?._id ?? null;
      this.sessionExpiresAt = Date.now() + this.SESSION_DURATION_MS;

      if (this.sessionId) {
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
