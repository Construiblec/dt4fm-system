import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';
import {
  DMS_CATEGORY_IDS,
  DmsCategoryCode,
} from './constants/dms-category.constants';

type CleaningTaskCard = {
  _id: number;
  _type?: string;
  Code?: string;
  Description?: string;
  TaskNumber: string;
  phase: string | number;
  _phase_description?: string;
  GeneratedDate: string;
  AssignedDateTime?: string;
  PlannedStartTime?: string;
  PlannedEndTime?: string;
  ActualStartTime?: string;
  ActualEndTime?: string;
  Observations?: string;
  Notes?: string;
  HostawayReservation?: string;
  CheckoutDate?: string;
  Source?: string;
  _Source_description?: string;
  Unit?: number;
  _Unit_description?: string;
  Employee?: number;
  _Employee_description?: string;
  CleaningChecklist?: number | null;
};

type CleaningActivityCard = {
  _id: number;
  Code?: string;
  Description?: string;
  NombrePlantilla?: string;
  Detalle?: string;
};

type CleaningActivityResponse = {
  success: boolean;
  data: CleaningActivityCard;
};

export type UnitCard = {
  _id: number;
  Code?: string;
  Description?: string;
  Name?: string;
};

type UnitResponse = {
  success: boolean;
  data: UnitCard;
};

type AttachmentCard = {
  _id: string;
  fileName: string;
  category: string;
  _category_description?: string;
  modified?: string;
  created?: string;
};

type OpenmaintAttachmentsResponse = {
  success: boolean;
  data: AttachmentCard[];
  meta?: { total: number };
};

type OpenmaintCardsResponse = {
  success: boolean;
  data: CleaningTaskCard[];
  meta?: { total: number };
};

type OpenmaintCardResponse = {
  success: boolean;
  data: CleaningTaskCard;
};

@Injectable()
export class CleaningTasksOpenmaintService {
  private readonly logger = new Logger(CleaningTasksOpenmaintService.name);

  constructor(
    private readonly client: OpenmaintClient,
    private readonly sessionService: CleaningTasksSessionService,
  ) {}

  private async session(): Promise<string> {
    return this.sessionService.getSessionId();
  }

  /**
   * Ejecuta una operación con retry automático si falla por sesión expirada
   */
  private async executeWithRetry<T>(
    operation: (sessionId: string) => Promise<T>,
    operationName: string,
  ): Promise<T> {
    try {
      const sessionId = await this.session();
      return await operation(sessionId);
    } catch (error) {
      // Si es error 401, refrescar sesión y reintentar UNA vez
      if (error.response?.status === 401 || error.status === 401) {
        this.logger.warn(`⚠️ Error 401 en ${operationName}, refrescando sesión y reintentando...`);
        
        // Forzar refresco de sesión
        await this.sessionService.refreshSession();
        
        // Reintentar operación
        const newSessionId = await this.session();
        return await operation(newSessionId);
      }
      
      // Si no es 401, lanzar error original
      throw error;
    }
  }

  async getCleaningTasks(date?: string): Promise<OpenmaintCardsResponse> {
    return this.executeWithRetry(async (sessionId) => {
      let path = '/classes/CleaningTask/cards?limit=100';

      if (date) {
        const filter = {
          attribute: {
            simple: {
              attribute: 'GeneratedDate',
              operator: 'equal',
              value: date,
            },
          },
        };
        path += `&filter=${encodeURIComponent(JSON.stringify(filter))}`;
      }

      return (await this.client.get(path, sessionId)) as OpenmaintCardsResponse;
    }, 'getCleaningTasks').catch((error) => {
      this.logger.error('Error al obtener tareas de limpieza:', error.message);
      throw new InternalServerErrorException(
        'Error al obtener tareas de limpieza de OpenMAINT',
      );
    });
  }

  async createCleaningTask(body: Record<string, unknown>): Promise<OpenmaintCardResponse> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.post(
        '/classes/CleaningTask/cards',
        body,
        sessionId,
      )) as OpenmaintCardResponse;
    }, 'createCleaningTask').catch((error) => {
      this.logger.error('Error al crear tarea:', error.message);
      throw new InternalServerErrorException(
        `Error al crear tarea de limpieza en OpenMAINT: ${error.message}`,
      );
    });
  }

  async updateCleaningTask(
    taskId: number,
    body: Record<string, unknown>,
  ): Promise<OpenmaintCardResponse> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.put(
        `/classes/CleaningTask/cards/${taskId}`,
        body,
        sessionId,
      )) as OpenmaintCardResponse;
    }, 'updateCleaningTask').catch((error) => {
      this.logger.error('Error al actualizar tarea:', error.message);
      throw new InternalServerErrorException(
        'Error al actualizar tarea de limpieza en OpenMAINT',
      );
    });
  }

  /**
   * Obtiene tareas de limpieza asignadas a un empleado usando el session token
   * del usuario autenticado (no la sesión interna del sistema).
   */
  async getTasksByEmployee(
    employeeId: number,
    _sessionToken: string,
    limit: number,
    offset: number,
  ): Promise<OpenmaintCardsResponse> {
    const filter = {
      attribute: {
        simple: {
          attribute: 'Employee',
          operator: 'equal',
          value: [employeeId],
        },
      },
    };

    const path = `/classes/CleaningTask/cards?filter=${encodeURIComponent(
      JSON.stringify(filter),
    )}&limit=${limit}&start=${offset}`;

    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.get(path, sessionId)) as OpenmaintCardsResponse;
    }, 'getTasksByEmployee').catch((error) => {
      this.logger.error('Error al obtener tareas del empleado:', error.message);
      throw new InternalServerErrorException(
        'Error al obtener tareas de limpieza de OpenMAINT',
      );
    });
  }

  /**
   * Obtiene el detalle de una tarea usando el session token del usuario.
   */
  async getTaskById(
    taskId: number,
    sessionToken: string,
  ): Promise<OpenmaintCardResponse> {
    try {
      return (await this.client.get(
        `/classes/CleaningTask/cards/${taskId}`,
        sessionToken,
      )) as OpenmaintCardResponse;
    } catch (error) {
      this.logger.error(`Error al obtener tarea ${taskId}:`, error.message);
      throw new InternalServerErrorException(
        `Error al obtener tarea ${taskId} de OpenMAINT`,
      );
    }
  }

  /**
   * Obtiene la CleaningActivity (checklist/plantilla) asociada a una tarea.
   * Usa la sesión interna del sistema con executeWithRetry porque la actividad
   * es datos de referencia, no datos del usuario.
   */
  async getCleaningActivity(
    activityId: number,
  ): Promise<CleaningActivityResponse> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.get(
        `/classes/CleaningActivity/cards/${activityId}`,
        sessionId,
      )) as CleaningActivityResponse;
    }, 'getCleaningActivity').catch((error) => {
      this.logger.error(
        `Error al obtener CleaningActivity ${activityId}:`,
        error.message,
      );
      throw new InternalServerErrorException(
        `Error al obtener CleaningActivity ${activityId} de OpenMAINT`,
      );
    });
  }

  /**
   * Obtiene el detalle de una Unit usando el session token del usuario.
   */
  async getUnitById(unitId: number, _sessionToken: string): Promise<UnitResponse> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.get(
        `/classes/Unit/cards/${unitId}`,
        sessionId,
      )) as UnitResponse;
    }, 'getUnitById').catch((error) => {
      this.logger.error(`Error al obtener Unit ${unitId}:`, error.message);
      throw new InternalServerErrorException(
        `Error al obtener Unit ${unitId} de OpenMAINT`,
      );
    });
  }

  /**
   * Actualiza una tarea usando el session token del usuario (no la sesión interna).
   */
  async updateTaskWithSession(
    taskId: number,
    body: Record<string, unknown>,
    sessionToken: string,
  ): Promise<OpenmaintCardResponse> {
    try {
      return (await this.client.put(
        `/classes/CleaningTask/cards/${taskId}`,
        body,
        sessionToken,
      )) as OpenmaintCardResponse;
    } catch (error) {
      this.logger.error(`Error al actualizar tarea ${taskId}:`, error.message);
      throw new InternalServerErrorException(
        `Error al actualizar tarea ${taskId} en OpenMAINT`,
      );
    }
  }

  /**
   * Lista los attachments de una tarea.
   */
  async getAttachments(
    taskId: number,
    sessionToken: string,
  ): Promise<OpenmaintAttachmentsResponse> {
    try {
      return (await this.client.get(
        `/classes/CleaningTask/cards/${taskId}/attachments`,
        sessionToken,
      )) as OpenmaintAttachmentsResponse;
    } catch (error) {
      this.logger.error(`Error al obtener attachments de tarea ${taskId}:`, error.message);
      throw new InternalServerErrorException(
        'Error al obtener attachments de OpenMAINT',
      );
    }
  }

  /**
   * Sube un attachment a una tarea.
   * OpenMAINT espera multipart/form-data con los campos "attachment" (JSON) y "file" (binario).
   * La categoría se convierte de código legible ("Photo") al ID numérico de DMS (390625).
   */
  async uploadAttachment(
    taskId: number,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    categoryCode: DmsCategoryCode,
    sessionToken: string,
  ): Promise<any> {
    const categoryId = DMS_CATEGORY_IDS[categoryCode];

    const formData = new globalThis.FormData();

    formData.append(
      'attachment',
      JSON.stringify({
        category: categoryId.toString(),
        fileName,
      }),
    );

    formData.append(
      'file',
      new Blob([new Uint8Array(fileBuffer)], { type: mimeType }),
      fileName,
    );

    try {
      return await this.client.postFormData(
        `/classes/CleaningTask/cards/${taskId}/attachments`,
        formData,
        sessionToken,
      );
    } catch (error) {
      this.logger.error(`Error al subir attachment a tarea ${taskId}:`, error.message);
      throw new InternalServerErrorException(
        'Error al subir archivo a OpenMAINT',
      );
    }
  }

  /**
   * Obtiene todas las tareas de limpieza (sin filtro de empleado).
   * Soporta filtros opcionales: phase, date (GeneratedDate), employeeId.
   * Usa la sesión interna del sistema con executeWithRetry.
   */
  async getAllTasks(
    options: {
      limit?: number;
      offset?: number;
      phase?: string;
      date?: string;
      employeeId?: number;
    } = {},
  ): Promise<OpenmaintCardsResponse> {
    return this.executeWithRetry(async (sessionId) => {
      const { limit = 50, offset = 0, phase, date, employeeId } = options;

      const conditions: any[] = [];

      if (phase) {
        conditions.push({
          simple: {
            attribute: 'phase',
            operator: 'equal',
            value: phase,
          },
        });
      }

      if (date) {
        conditions.push({
          simple: {
            attribute: 'GeneratedDate',
            operator: 'equal',
            value: date,
          },
        });
      }

      if (employeeId) {
        conditions.push({
          simple: {
            attribute: 'Employee',
            operator: 'equal',
            value: [employeeId],
          },
        });
      }

      let filterParam = '';
      if (conditions.length === 1) {
        filterParam = `&filter=${encodeURIComponent(
          JSON.stringify({ attribute: conditions[0] }),
        )}`;
      } else if (conditions.length > 1) {
        filterParam = `&filter=${encodeURIComponent(
          JSON.stringify({
            and: conditions.map((c) => ({ attribute: c })),
          }),
        )}`;
      }

      const path = `/classes/CleaningTask/cards?limit=${limit}&start=${offset}${filterParam}`;
      return (await this.client.get(path, sessionId)) as OpenmaintCardsResponse;
    }, 'getAllTasks').catch((error) => {
      this.logger.error('Error al obtener todas las tareas:', error.message);
      throw new InternalServerErrorException(
        'Error al obtener tareas de limpieza de OpenMAINT',
      );
    });
  }

  /**
   * Descarga el binario de un attachment desde OpenMAINT y lo retorna como stream.
   */
  async downloadAttachment(
    taskId: number,
    attachmentId: string,
    sessionToken: string,
  ): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    const path = `/classes/CleaningTask/cards/${taskId}/attachments/${attachmentId}/download`;
    try {
      const response = await this.client.getBuffer(path, sessionToken);
      return response;
    } catch (error) {
      this.logger.error(`Error al descargar attachment ${attachmentId}:`, error.message);
      throw new InternalServerErrorException('Error al descargar el archivo desde OpenMAINT');
    }
  }

  async taskExistsByReservationId(reservationId: string): Promise<boolean> {
    try {
      return await this.executeWithRetry(async (sessionId) => {
        const filter = {
          attribute: {
            simple: {
              attribute: 'HostawayReservation',
              operator: 'equal',
              value: reservationId,
            },
          },
        };

        const path = `/classes/CleaningTask/cards?filter=${encodeURIComponent(JSON.stringify(filter))}&limit=1`;
        const response = (await this.client.get(path, sessionId)) as OpenmaintCardsResponse;
        
        return (response.data?.length ?? 0) > 0;
      }, 'taskExistsByReservationId');
    } catch (error) {
      this.logger.error('Error al verificar duplicados:', error.message);
      return false;
    }
  }
}
