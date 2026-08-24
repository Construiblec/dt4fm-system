import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../../integrations/openmaint/openmaint.client';
import { PHASE_IDS } from '../../cleaning-tasks/constants/phase.constants';
import { PM_STATUS_IDS } from '../../preventive-maintenance/constants/preventive-maint.constants';

export type PlanningPreventiveCard = {
  _id: number;
  Number?: string | null;
  ExpExecStartDate?: string | null;
  _PrevMaintConfig_description?: string | null;
  _CISubset_description?: string | null;
  _CI_description?: string | null;
};

export type AssignedCleaningTaskCard = {
  _id: number;
  Employee?: number | null;
  _Employee_description?: string | null;
  Unit?: number | null;
  _Unit_description?: string | null;
  PlannedStartTime?: string | null;
  ActualStartTime?: string | null;
  _phase_description?: string | null;
};

const QUERY_LIMIT = 200;

/**
 * Consultas propias de los schedulers de push. Vive aquí y no en los gateways
 * de dominio para que el módulo de push no dependa de los módulos que lo
 * consumen (crearía un ciclo).
 */
@Injectable()
export class PushSchedulerGateway {
  private readonly logger = new Logger(PushSchedulerGateway.name);

  /** Sesión de servicio cacheada; se invalida ante cualquier fallo. */
  private cachedSessionId: string | null = null;

  constructor(
    private readonly client: OpenmaintClient,
    private readonly authService: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {}

  async getServiceSessionId(): Promise<string | null> {
    if (this.cachedSessionId) return this.cachedSessionId;

    const username = this.configService.get<string>('OPENMAINT_USERNAME');
    const password = this.configService.get<string>('OPENMAINT_PASSWORD');

    if (!username || !password) {
      this.logger.warn(
        'Faltan OPENMAINT_USERNAME/OPENMAINT_PASSWORD: se omite el barrido.',
      );
      return null;
    }

    try {
      const response = await this.authService.login(username, password);
      this.cachedSessionId = response?.data?._id ?? null;
      return this.cachedSessionId;
    } catch (error) {
      this.logger.warn(
        `No se pudo abrir sesión de servicio: ${(error as Error)?.message}`,
      );
      return null;
    }
  }

  private invalidateSession(): void {
    this.cachedSessionId = null;
  }

  /** Preventivos en Planificación, con todos los atributos (sin onlyGridAttrs). */
  async findPlanningPreventives(
    sessionId: string,
  ): Promise<PlanningPreventiveCard[]> {
    const params = new URLSearchParams({
      include_tasklist: 'false',
      limit: String(QUERY_LIMIT),
      filter: JSON.stringify({
        attribute: {
          simple: {
            attribute: 'ProcessStatus',
            operator: 'equal',
            value: [String(PM_STATUS_IDS.PLANNING)],
          },
        },
      }),
    });

    try {
      const response = (await this.client.get(
        `/processes/PreventiveMaint/instances?${params.toString()}`,
        sessionId,
      )) as { data?: PlanningPreventiveCard[] };

      return response.data ?? [];
    } catch (error) {
      this.invalidateSession();
      this.logger.warn(
        `No se pudieron leer los preventivos en planificación: ${(error as Error)?.message}`,
      );
      return [];
    }
  }

  /** Tareas de limpieza en fase Assigned (las candidatas a estar atrasadas). */
  async findAssignedCleaningTasks(
    sessionId: string,
  ): Promise<AssignedCleaningTaskCard[]> {
    const params = new URLSearchParams({
      limit: String(QUERY_LIMIT),
      filter: JSON.stringify({
        attribute: {
          simple: {
            attribute: 'phase',
            operator: 'equal',
            value: [String(PHASE_IDS.ASSIGNED)],
          },
        },
      }),
    });

    try {
      const response = (await this.client.get(
        `/classes/CleaningTask/cards?${params.toString()}`,
        sessionId,
      )) as { data?: AssignedCleaningTaskCard[] };

      return response.data ?? [];
    } catch (error) {
      this.invalidateSession();
      this.logger.warn(
        `No se pudieron leer las tareas de limpieza asignadas: ${(error as Error)?.message}`,
      );
      return [];
    }
  }

  /** Edificio de una unidad; el texto de la notificación lo necesita. */
  async findUnitBuilding(
    unitId: number,
    sessionId: string,
  ): Promise<string | null> {
    try {
      const response = (await this.client.get(
        `/classes/Unit/cards/${unitId}`,
        sessionId,
      )) as { data?: { _Building_description?: string | null } };

      return response.data?._Building_description ?? null;
    } catch {
      return null;
    }
  }
}
