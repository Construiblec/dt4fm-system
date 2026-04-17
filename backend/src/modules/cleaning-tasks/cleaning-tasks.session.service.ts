import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
      this.logger.warn('⚠️ Sesión expirada o inválida, refrescando...');
      await this.refreshSession();
    }
    
    return this.sessionId || '';
  }

  /**
   * Fuerza el refresco de la sesión
   */
  async refreshSession(): Promise<void> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME') || 'admin';
    const password = this.configService.get<string>('OPENMAINT_PASSWORD') || 'admin';

    try {
      this.logger.log('🔄 Solicitando nueva sesión a OpenMAINT...');
      
      const response = await this.client.post(
        '/sessions?scope=service&returnId=true',
        { username, password },
      ) as any;

      this.sessionId = response?.data?._id ?? null;
      this.sessionExpiresAt = Date.now() + this.SESSION_DURATION_MS;
      
      if (this.sessionId) {
        this.logger.log(`✅ Sesión iniciada: ${this.sessionId.substring(0, 10)}...`);
        this.logger.log(`⏰ Sesión válida hasta: ${new Date(this.sessionExpiresAt).toLocaleTimeString()}`);
      } else {
        this.logger.error('❌ No se pudo obtener session ID de OpenMAINT');
      }
    } catch (error) {
      this.logger.error('❌ Error al iniciar sesión con OpenMAINT:', error.message);
      this.sessionId = null;
      this.sessionExpiresAt = 0;
    }
  }

  /**
   * Invalida la sesión actual (fuerza refresco en próxima llamada)
   */
  invalidateSession(): void {
    this.logger.warn('⚠️ Sesión invalidada manualmente');
    this.sessionId = null;
    this.sessionExpiresAt = 0;
  }
}
