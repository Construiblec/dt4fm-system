import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
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
  PlannedStartTime?: string;
  PlannedEndTime?: string;
  ActualStartTime?: string;
  ActualEndTime?: string;
  ExecutionTime?: number;
  DelayTime?: number;
  Observations?: string;
  SupervisionObserv?: string;
  TeamObservations?: string;
  Notes?: string;
  HostawayReservation?: string;
  CheckoutDate?: string;
  Source?: string;
  _Source_description?: string;
  Unit?: number;
  _Unit_description?: string;
  Employee?: number;
  _Employee_description?: string;
  HostawayListingID?: string | null;
  CleaningChecklist?: number | null;
  _CleaningChecklist_description?: string | null;
};

export type EmployeeCard = {
  _id: number;
  _type?: string;
  Description?: string;
  Team?: number | null;
  _Team_description?: string | null;
};

export type UnitListingCard = {
  _id: number;
  HostawayListingID?: string | null;
};

type CleaningActivityCard = {
  _id: number;
  Code?: string;
  Description?: string;
  NombrePlantilla?: string;
  Detalle?: string;
  /**
   * Atributo de tipo `file`. CMDBuild guarda estos atributos como un adjunto
   * más de la tarjeta y deja acá el id del nodo en el DMS (Alfresco), así que
   * este valor ES el `{attachmentId}` de la URL de descarga. Viene vacío o nulo
   * mientras nadie suba un archivo.
   */
  Plantilla?: string | null;
  /** Metadatos aplanados del adjunto. Solo se usan para el log. */
  _Plantilla_FileName?: string | null;
  _Plantilla_Size?: number | null;
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
  /** El edificio al que pertenece; hace falta para el texto de las notificaciones. */
  Building?: number | null;
  _Building_description?: string | null;
};

type UnitResponse = {
  success: boolean;
  data: UnitCard;
};

export type { CleaningActivityCard, CleaningTaskCard };

export type AttachmentCard = {
  _id: string;
  /** Los adjuntos de clase traen el nombre aquí; `fileName` llega vacío. */
  name?: string;
  fileName: string;
  category: string;
  _category_description?: string;
  description?: string | null;
  author?: string;
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
        this.logger.warn(
          `⚠️ Error 401 en ${operationName}, refrescando sesión y reintentando...`,
        );

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

  async createCleaningTask(
    body: Record<string, unknown>,
  ): Promise<OpenmaintCardResponse> {
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
   * Igual que `getTaskById` pero con la sesión interna. La asignación
   * (`PUT /cleaning-tasks/:id`) no recibe sesión de usuario y aun así necesita
   * releer la tarea para armar el texto de la notificación.
   */
  async getTaskByIdWithSession(taskId: number): Promise<OpenmaintCardResponse> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.get(
        `/classes/CleaningTask/cards/${taskId}`,
        sessionId,
      )) as OpenmaintCardResponse;
    }, 'getTaskByIdWithSession');
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
   * Bytes del CSV colgado del atributo `Plantilla` de una CleaningActivity.
   *
   * Un atributo de tipo `file` no tiene endpoint propio: CMDBuild lo materializa
   * como un adjunto de la tarjeta, y el valor del atributo es el id de ese
   * adjunto. Por eso se descarga por la misma ruta que cualquier otro adjunto,
   * la misma que ya usan los manuales de equipos.
   *
   * Usa la sesión interna por el mismo motivo que `getCleaningActivity`: la
   * plantilla es dato de referencia, no dato del usuario.
   */
  async downloadActivityTemplate(
    activityId: number,
    attachmentId: string,
  ): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    return this.executeWithRetry(
      (sessionId) =>
        this.client.getBuffer(
          `/classes/CleaningActivity/cards/${activityId}/attachments/${encodeURIComponent(
            attachmentId,
          )}/download`,
          sessionId,
        ),
      'downloadActivityTemplate',
    );
  }

  /**
   * Obtiene el detalle de una Unit usando el session token del usuario.
   */
  async getUnitById(
    unitId: number,
    _sessionToken: string,
  ): Promise<UnitResponse> {
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
      this.logger.error(
        `Error al obtener attachments de tarea ${taskId}:`,
        error.message,
      );
      throw new InternalServerErrorException(
        'Error al obtener attachments de OpenMAINT',
      );
    }
  }

  /**
   * Borra un attachment de una tarea.
   */
  async deleteAttachment(
    taskId: number,
    attachmentId: string,
    sessionToken: string,
  ): Promise<any> {
    try {
      return await this.client.delete(
        `/classes/CleaningTask/cards/${taskId}/attachments/${attachmentId}`,
        sessionToken,
      );
    } catch (error) {
      this.logger.error(
        `Error al borrar attachment ${attachmentId} de tarea ${taskId}:`,
        error.message,
      );
      throw new InternalServerErrorException(
        'Error al borrar archivo en OpenMAINT',
      );
    }
  }

  /**
   * Sube un attachment a una tarea.
   * OpenMAINT espera multipart/form-data con los campos "attachment" (JSON) y "file" (binario).
   * La categoría se convierte de código legible ("Photo") al ID numérico de DMS (390625).
   * La descripción es lo que distingue la evidencia de supervisión de la del operario.
   */
  async uploadAttachment(
    taskId: number,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    categoryCode: DmsCategoryCode,
    sessionToken: string,
    description?: string,
  ): Promise<{ data?: AttachmentCard } | undefined> {
    const categoryId = DMS_CATEGORY_IDS[categoryCode];

    const formData = new globalThis.FormData();

    formData.append(
      'attachment',
      JSON.stringify({
        category: categoryId.toString(),
        fileName,
        ...(description ? { description } : {}),
      }),
    );

    formData.append(
      'file',
      new Blob([new Uint8Array(fileBuffer)], { type: mimeType }),
      fileName,
    );

    try {
      return (await this.client.postFormData(
        `/classes/CleaningTask/cards/${taskId}/attachments`,
        formData,
        sessionToken,
      )) as { data?: AttachmentCard } | undefined;
    } catch (error) {
      this.logger.error(
        `Error al subir attachment a tarea ${taskId}:`,
        error.message,
      );
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
      /** 'newest': las recién creadas primero (por id descendente). */
      sort?: 'newest';
    } = {},
  ): Promise<OpenmaintCardsResponse> {
    return this.executeWithRetry(async (sessionId) => {
      const { limit = 50, offset = 0, phase, date, employeeId, sort } = options;

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

      const sortParam =
        sort === 'newest'
          ? `&sort=${encodeURIComponent(JSON.stringify([{ property: '_id', direction: 'DESC' }]))}`
          : '';
      const path = `/classes/CleaningTask/cards?limit=${limit}&start=${offset}${sortParam}${filterParam}`;
      return (await this.client.get(path, sessionId)) as OpenmaintCardsResponse;
    }, 'getAllTasks').catch((error) => {
      this.logger.error('Error al obtener todas las tareas:', error.message);
      throw new InternalServerErrorException(
        'Error al obtener tareas de limpieza de OpenMAINT',
      );
    });
  }

  /**
   * Tarjetas que vienen de Hostaway (tienen reserva), las más recientes primero.
   * Es lo que necesita la vista previa de sincronización para cruzar cada
   * checkout con su limpieza, sin depender de la fecha de checkout guardada
   * (que es justo la que puede haber cambiado).
   */
  async getHostawayTasks(limit = 500): Promise<OpenmaintCardsResponse> {
    return this.executeWithRetry(async (sessionId) => {
      const filter = {
        attribute: {
          simple: { attribute: 'HostawayReservation', operator: 'isnotnull' },
        },
      };
      const sort = [{ property: '_id', direction: 'DESC' }];
      const path = `/classes/CleaningTask/cards?limit=${limit}&filter=${encodeURIComponent(
        JSON.stringify(filter),
      )}&sort=${encodeURIComponent(JSON.stringify(sort))}`;
      return (await this.client.get(path, sessionId)) as OpenmaintCardsResponse;
    }, 'getHostawayTasks').catch((error) => {
      this.logger.error('Error al obtener tareas de Hostaway:', error.message);
      throw new InternalServerErrorException(
        'Error al obtener tareas de limpieza de OpenMAINT',
      );
    });
  }

  /**
   * Empleados internos: los únicos que pueden ser `Employee` de una limpieza
   * (la referencia apunta a `InternalEmployee`). Los proveedores quedan fuera
   * por construcción. Sesión interna: es dato de referencia.
   */
  async listInternalEmployees(): Promise<{ data: EmployeeCard[] }> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.get(
        '/classes/InternalEmployee/cards?limit=500',
        sessionId,
      )) as { data: EmployeeCard[] };
    }, 'listInternalEmployees').catch((error) => {
      this.logger.error('Error al listar empleados:', error.message);
      throw new InternalServerErrorException(
        'Error al consultar los empleados en OpenMAINT',
      );
    });
  }

  /**
   * Unidades que tienen `HostawayListingID`. Con eso se sabe, para cada
   * listing, si openMAINT va a poder vincular la unidad: ninguna (sin unidad),
   * una (vínculo) o varias (ambiguo).
   */
  async listUnitsWithListing(): Promise<{ data: UnitListingCard[] }> {
    return this.executeWithRetry(async (sessionId) => {
      const filter = {
        attribute: {
          simple: { attribute: 'HostawayListingID', operator: 'isnotnull' },
        },
      };
      return (await this.client.get(
        `/classes/Unit/cards?limit=500&filter=${encodeURIComponent(JSON.stringify(filter))}`,
        sessionId,
      )) as { data: UnitListingCard[] };
    }, 'listUnitsWithListing').catch((error) => {
      this.logger.warn(
        `No se pudieron leer los listings de las unidades: ${error.message}`,
      );
      return { data: [] as UnitListingCard[] };
    });
  }

  async listCleaningActivities(): Promise<{ data: CleaningActivityCard[] }> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.get(
        '/classes/CleaningActivity/cards?limit=200',
        sessionId,
      )) as { data: CleaningActivityCard[] };
    }, 'listCleaningActivities').catch((error) => {
      this.logger.error('Error al listar checklists:', error.message);
      throw new InternalServerErrorException(
        'Error al consultar los checklists en OpenMAINT',
      );
    });
  }

  async createCleaningActivity(
    body: Record<string, unknown>,
  ): Promise<CleaningActivityResponse> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.post(
        '/classes/CleaningActivity/cards',
        body,
        sessionId,
      )) as CleaningActivityResponse;
    }, 'createCleaningActivity').catch((error) => {
      this.logger.error('Error al crear checklist:', error.message);
      throw new InternalServerErrorException(
        'Error al crear el checklist en OpenMAINT',
      );
    });
  }

  async updateCleaningActivity(
    activityId: number,
    body: Record<string, unknown>,
  ): Promise<CleaningActivityResponse> {
    return this.executeWithRetry(async (sessionId) => {
      return (await this.client.put(
        `/classes/CleaningActivity/cards/${activityId}`,
        body,
        sessionId,
      )) as CleaningActivityResponse;
    }, 'updateCleaningActivity').catch((error) => {
      this.logger.error(
        `Error al editar checklist ${activityId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Error al guardar el checklist en OpenMAINT',
      );
    });
  }

  /**
   * Borra los adjuntos sueltos de un checklist que se llaman igual que el
   * archivo por subir. Quedan así cuando una subida anterior falló a medias
   * (el adjunto entró pero nunca se enlazó a `Plantilla`) y OpenMAINT rechaza
   * un segundo archivo con el mismo nombre. Best-effort: nunca propaga.
   */
  async removeStaleActivityAttachments(
    activityId: number,
    fileName: string,
  ): Promise<void> {
    try {
      const listed = (await this.executeWithRetry(
        (sessionId) =>
          this.client.get(
            `/classes/CleaningActivity/cards/${activityId}/attachments`,
            sessionId,
          ),
        'listActivityAttachments',
      )) as { data?: Array<{ _id: string; name?: string }> } | undefined;

      for (const attachment of listed?.data ?? []) {
        if (attachment.name?.toLowerCase() !== fileName.toLowerCase()) continue;
        await this.executeWithRetry(
          (sessionId) =>
            this.client.delete(
              `/classes/CleaningActivity/cards/${activityId}/attachments/${encodeURIComponent(attachment._id)}`,
              sessionId,
            ),
          'removeStaleActivityAttachment',
        );
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron limpiar adjuntos sueltos del checklist ${activityId}: ${(error as Error)?.message}`,
      );
    }
  }

  /**
   * Sube el archivo CSV de un checklist y devuelve el id del adjunto.
   *
   * Verificado contra la instancia (2026-10-12): subir el adjunto NO enlaza el
   * atributo `Plantilla`; hay que guardar después ese id en la tarjeta
   * (`PUT { Plantilla: id }`). Y el adjunto ya enlazado no se puede borrar ni
   * reemplazar por el nombre ("file name conflict" / 500): se quita poniendo
   * `Plantilla: null` en la tarjeta, que se lleva el archivo consigo.
   */
  async uploadActivityTemplate(
    activityId: number,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<string> {
    const formData = new globalThis.FormData();
    formData.append(
      'attachment',
      JSON.stringify({ fileName: file.originalname }),
    );
    formData.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );

    const response = await this.executeWithRetry(async (sessionId) => {
      return (await this.client.postFormData(
        `/classes/CleaningActivity/cards/${activityId}/attachments`,
        formData,
        sessionId,
      )) as { data?: { _id?: string } } | undefined;
    }, 'uploadActivityTemplate').catch((error) => {
      this.logger.error(
        `Error al subir la plantilla del checklist ${activityId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Error al subir el archivo de la plantilla a OpenMAINT',
      );
    });

    const attachmentId = response?.data?._id;
    if (!attachmentId) {
      throw new InternalServerErrorException(
        'OpenMAINT no devolvió el id del archivo de la plantilla',
      );
    }
    return attachmentId;
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
      this.logger.error(
        `Error al descargar attachment ${attachmentId}:`,
        error.message,
      );
      throw new InternalServerErrorException(
        'Error al descargar el archivo desde OpenMAINT',
      );
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
        const response = (await this.client.get(
          path,
          sessionId,
        )) as OpenmaintCardsResponse;

        return (response.data?.length ?? 0) > 0;
      }, 'taskExistsByReservationId');
    } catch (error) {
      this.logger.error('Error al verificar duplicados:', error.message);
      return false;
    }
  }
}
