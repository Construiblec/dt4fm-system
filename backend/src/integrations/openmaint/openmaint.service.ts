import {
  BadGatewayException,
  InternalServerErrorException,
  Injectable,
} from '@nestjs/common';
import FormData from 'form-data';
import {
  CM_ACTIONS,
  CM_OUTCOME_POSITIVE,
} from '../../modules/maintenance-supervision/constants/corrective-maint.constants';
import { OpenmaintClient } from './openmaint.client';
import type { OpenmaintSession } from './openmaint.auth.service';

type EmployeeCard = {
  _id: number;
  /** Subclase de la ficha; `SupplierEmployee` identifica a un proveedor */
  _type?: string;
  Description?: string | null;
  Team?: number | null;
  _Team_code?: string | null;
  _Team_description?: string | null;
};

type EmployeeCardsResponse = {
  data?: EmployeeCard[];
};

/**
 * Identidad y rol del llamante. La forma la define `OpenmaintAuthService`, que
 * es quien habla con `/sessions`; se reexporta para no obligar a los
 * consumidores a saber de qué archivo sale.
 */
export type { OpenmaintSession };

type TenantCard = {
  _id: number;
  Description: string;
  IDNumber: number;
  Phone: number;
  Email: string | null;
  _OccupancyType_code: string;
};

type TenantCardsResponse = {
  data?: TenantCard[];
  meta?: { total: number };
};

type OpenmaintCreateIncidentBody = {
  _type: 'CorrectiveMaint';
  _activity: 'CM01-Opening';
  _advance: true;
  OpeningDate: string;
  ShortDescr: string;
  ProcessNotes: string;
  Requester: number;
  Type: number;
  Priority: number;
  Site: number;
  // Ubicación fina: opcionales en CorrectiveMaint, se omiten si no se eligieron
  Floor?: number;
  Unit?: number;
  CommonArea?: number;
  Category: number;
  Subcategory: number;
  ProcessStatus: number;
};

type OpenmaintIncidentResponse = {
  success?: boolean;
  data?: {
    _id?: number;
    Id?: number;
    id?: number;
  };
};

type UploadedImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

type CompleteIncidentBody = {
  _id: number;
  _type: 'CorrectiveMaint';
  _activity: string;
  _advance: true;
  /** ID numérico del lookup `Process - Action`, no el código. Ver `CM_ACTIONS`. */
  Action: number;
  Outcome: number;
  /** Fin real del trabajo; es lo que le da duración al parte. */
  ExecEndDate: string;
  ProcessNotes: string | null;
};

type StartIncidentBody = {
  _id: number;
  _type: 'CorrectiveMaint';
  _activity: string;
  /** Sella el atributo sin avanzar el flujo: el trabajo sigue en CM03. */
  _advance: false;
  ExecStartDate: string;
};

type OpenmaintCreateUserBody = {
  username: string;
  password: string;
  description: string;
  email: string;
  active: boolean;
  defaultUserGroup: number;
  // OpenMAINT requiere userGroups como array obligatorio
  userGroups: { _id: number; name: string }[];
};

@Injectable()
export class OpenmaintService {
  constructor(private readonly client: OpenmaintClient) {}

  async getBuildings(sessionId: string) {
    return this.client.get('/classes/Building/cards', sessionId);
  }

  private buildEqualFilter(attribute: string, value: number): string {
    return encodeURIComponent(
      JSON.stringify({
        attribute: { simple: { attribute, operator: 'equal', value: [value] } },
      }),
    );
  }

  // limit=500 evita el truncado silencioso por el default de paginación de CMDBuild
  private getCardsByBuilding(
    className: string,
    buildingId: number,
    sessionId: string,
  ) {
    const filter = this.buildEqualFilter('Building', buildingId);

    return this.client.get(
      `/classes/${className}/cards?limit=500&filter=${filter}`,
      sessionId,
    );
  }

  async getFloorsByBuilding(buildingId: number, sessionId: string) {
    return this.getCardsByBuilding('Floor', buildingId, sessionId);
  }

  async getUnitsByBuilding(buildingId: number, sessionId: string) {
    return this.getCardsByBuilding('Unit', buildingId, sessionId);
  }

  async getCommonAreasByBuilding(buildingId: number, sessionId: string) {
    return this.getCardsByBuilding('CommonAreas', buildingId, sessionId);
  }

  async getIncidentsByAssignee(sessionId: string, employeeId: number) {
    const encodedSort = encodeURIComponent(
      JSON.stringify([
        {
          property: 'Sorting',
          direction: 'DESC',
        },
      ]),
    );
    const searchFilter = {
      attribute: {
        simple: {
          attribute: 'Assignee',
          operator: 'equal',
          value: [employeeId],
        },
      },
    };

    const encodedFilter = encodeURIComponent(JSON.stringify(searchFilter));
    const path = `/processes/CorrectiveMaint/instances?include_tasklist=false&onlyGridAttrs=true&start=0&limit=50&sort=${encodedSort}&filter=${encodedFilter}`;

    try {
      return await this.client.get(path, sessionId);
    } catch (error) {
      const errorMsg =
        error.response?.data?.messages?.[0]?.message ||
        error.response?.data?.message ||
        error.message;
      console.error(`Error al consultar incidentes en OpenMAINT: ${errorMsg}`);
      throw new BadGatewayException(
        `Error al consultar incidentes: ${errorMsg}`,
      );
    }
  }

  async getIncidentDetail(incidentId: number, sessionId: string) {
    return this.client.get(
      `/processes/CorrectiveMaint/instances/${incidentId}`,
      sessionId,
    );
  }

  async getIncidentWithTask(incidentId: number, sessionId: string) {
    return this.client.get(
      `/processes/CorrectiveMaint/instances/${incidentId}?include_tasklist=true`,
      sessionId,
    );
  }

  async getIncidentAttachments(incidentId: number, sessionId: string) {
    return this.client.get(
      `/processes/CorrectiveMaint/instances/${incidentId}/attachments`,
      sessionId,
    );
  }

  async getAttachmentPreview(
    incidentId: number,
    attachmentId: string,
    sessionId: string,
  ) {
    return this.client.get(
      `/processes/CorrectiveMaint/instances/${incidentId}/attachments/${attachmentId}/preview`,
      sessionId,
    );
  }

  async uploadCompletionAttachment(
    incidentId: number,
    file: UploadedImage,
    sessionId: string,
  ) {
    const formData = new FormData();

    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    formData.append(
      'attachment',
      JSON.stringify({
        fileName: file.originalname,
        majorVersion: true,
      }),
    );

    return this.client.post(
      `/processes/CorrectiveMaint/instances/${incidentId}/attachments`,
      formData,
      sessionId,
      {
        headers: formData.getHeaders(),
      },
    );
  }

  /**
   * Sella el inicio real del trabajo sin avanzar el flujo (`_advance: false`),
   * que es lo que hace el botón «Guardar» de OpenMAINT.
   *
   * El correctivo ya está en CM03 desde que el supervisor lo asignó, así que no
   * hay ninguna transición que ejecutar: lo único que falta es la marca de
   * tiempo. Mientras `ExecStartDate` esté vacío el trabajo se muestra como
   * «Asignado»; en cuanto se sella pasa a «Ejecución».
   *
   * Verificado contra el clon: CM03 declara `ExecStartDate` escribible y el PUT
   * lo persiste (también admite volver a `null`).
   */
  async startIncident(
    incidentId: number,
    activityId: string,
    execStartDate: string,
    sessionId: string,
  ): Promise<void> {
    const body: StartIncidentBody = {
      _id: incidentId,
      _type: 'CorrectiveMaint',
      _activity: activityId,
      _advance: false,
      ExecStartDate: execStartDate,
    };

    await this.client.put(
      `/processes/CorrectiveMaint/instances/${incidentId}`,
      body,
      sessionId,
    );
  }

  /**
   * Cierra el trabajo con `CM03-Advance` y lo deja en contabilidad, a la espera
   * de la revisión del supervisor.
   *
   * Dos detalles que costaron una sonda contra el clon:
   *
   * - `Action` va como **ID numérico**. Con el código (`'CM03-Advance'`)
   *   OpenMAINT guarda `Action: null` y aplica la transición por defecto del
   *   paso; aquí coincide, pero deja el parte sin la acción registrada.
   * - `ExecEndDate` hay que mandarlo explícitamente. CM03 lo declara
   *   obligatorio, pero **la API no lo valida** — solo la interfaz de
   *   OpenMAINT. Sin él el flujo avanza igual y el trabajo queda cerrado sin
   *   fin, así que el supervisor no ve ninguna duración.
   */
  async completeIncident(
    incidentId: number,
    activityId: string,
    notes: string | null,
    execEndDate: string,
    sessionId: string,
  ) {
    const body: CompleteIncidentBody = {
      _id: incidentId,
      _type: 'CorrectiveMaint',
      _activity: activityId,
      _advance: true,
      Action: CM_ACTIONS.CONCLUDE,
      Outcome: CM_OUTCOME_POSITIVE,
      ExecEndDate: execEndDate,
      ProcessNotes: notes,
    };

    return this.client.put(
      `/processes/CorrectiveMaint/instances/${incidentId}`,
      body,
      sessionId,
    );
  }

  /**
   * Sesión del llamante. Se usa para verificar identidad y rol contra
   * openMAINT en vez de creerle al header `x-role`, que sale de localStorage.
   *
   * `/sessions/current` la resuelve desde la propia cabecera de autorización:
   * a diferencia de `/users/{id}` no exige privilegios de administrador, y ata
   * el rol a la sesión, así que nadie puede suscribirse en nombre de otro.
   *
   * No captura errores a propósito: quien llama decide qué hacer con ellos.
   */
  async getSession(sessionId: string): Promise<OpenmaintSession | null> {
    const response = (await this.client.get(
      '/sessions/current',
      sessionId,
    )) as {
      data?: OpenmaintSession;
    };

    return response?.data ?? null;
  }

  async resolveEmployeeId(
    userId: number,
    sessionId?: string,
  ): Promise<number | null> {
    const filter = {
      attribute: {
        simple: {
          attribute: 'LoginUser',
          operator: 'equal',
          value: userId,
        },
      },
    };

    const encodedFilter = encodeURIComponent(JSON.stringify(filter));

    try {
      const response = (await this.client.get(
        `/classes/Employee/cards?filter=${encodedFilter}`,
        sessionId,
      )) as EmployeeCardsResponse;

      return response.data?.[0]?._id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Empleados candidatos a cesionario, opcionalmente acotados a un equipo.
   *
   * `_type` viene con la subclase de la ficha (`InternalEmployee`,
   * `ExternalEmployee`, `SupplierEmployee`, `CustomerEmployee`): es lo único
   * que distingue a un proveedor, porque la clase `Team` no tiene ningún flag
   * para ello.
   */
  async getEmployees(
    sessionId: string,
    teamId?: number,
  ): Promise<EmployeeCardsResponse> {
    const params = new URLSearchParams({ limit: '500' });

    if (teamId !== undefined) {
      params.set(
        'filter',
        JSON.stringify({
          attribute: {
            simple: {
              attribute: 'Team',
              operator: 'equal',
              value: [String(teamId)],
            },
          },
        }),
      );
    }

    return (await this.client.get(
      `/classes/Employee/cards?${params.toString()}`,
      sessionId,
    )) as EmployeeCardsResponse;
  }

  async getEmployeeCard(employeeId: number, sessionId: string): Promise<any> {
    try {
      return await this.client.get(
        `/classes/Employee/cards/${employeeId}`,
        sessionId,
      );
    } catch (error) {
      console.error(
        `[OpenMAINT] Error al obtener ficha de empleado ${employeeId}:`,
        error?.message,
      );
      return null;
    }
  }

  async resolveCleaningEmployeeId(
    username: string,
    sessionId?: string,
  ): Promise<number | null> {
    const filter = {
      attribute: {
        simple: {
          attribute: 'PortalUsername',
          operator: 'equal',
          value: [username],
        },
      },
    };

    const encodedFilter = encodeURIComponent(JSON.stringify(filter));

    try {
      const response = (await this.client.get(
        `/classes/Employee/cards?filter=${encodedFilter}&limit=1`,
        sessionId,
      )) as EmployeeCardsResponse;

      return response.data?.[0]?._id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Ficha `Tenant` que corresponde a la descripción de un usuario.
   *
   * El vínculo es frágil de origen y se mantiene tal cual estaba en
   * `owners.service.ts` para no cambiar de comportamiento al unificar el login:
   * openMAINT no guarda ninguna FK entre la cuenta y el `Tenant`, así que la
   * única vía es buscar el `Tenant` que se llame **exactamente** igual que la
   * descripción del usuario. Si algún día se añade esa FK, este es el único
   * sitio a tocar.
   *
   * Necesita sesión de servicio: la del propio residente no lee `Tenant`.
   */
  async findTenantByDescription(
    description: string,
    serviceSessionId: string,
  ): Promise<number | null> {
    if (!description) {
      return null;
    }

    const filter = encodeURIComponent(
      JSON.stringify({
        attribute: {
          simple: {
            attribute: 'Description',
            operator: 'equal',
            value: description,
          },
        },
      }),
    );

    try {
      const response = (await this.client.get(
        `/classes/Tenant/cards?filter=${filter}&limit=1`,
        serviceSessionId,
      )) as TenantCardsResponse;

      return response?.data?.[0]?._id ?? null;
    } catch {
      return null;
    }
  }

  async findTenantByIdNumber(
    idNumber: string,
    sessionId: string,
  ): Promise<TenantCard | null> {
    const tenantFilter = encodeURIComponent(
      JSON.stringify({
        attribute: {
          simple: {
            attribute: 'IDNumber',
            operator: 'equal',
            value: Number(idNumber),
          },
        },
      }),
    );

    try {
      const tenantResponse = (await this.client.get(
        `/classes/Tenant/cards?filter=${tenantFilter}&limit=1`,
        sessionId,
      )) as TenantCardsResponse;

      return tenantResponse.data?.[0] ?? null;
    } catch (err) {
      console.error('[findTenant] error:', err);
      return null;
    }
  }

  async createOwnerUser(
    body: OpenmaintCreateUserBody,
    sessionId: string,
  ): Promise<{ _id: number; username: string }> {
    try {
      console.log(
        '[OpenMAINT] createOwnerUser - payload:',
        JSON.stringify({ ...body, password: '***' }),
      );

      const response = (await this.client.post('/users', body, sessionId)) as {
        success?: boolean;
        data?: { _id: number; username: string };
      };

      console.log(
        '[OpenMAINT] createOwnerUser - response:',
        JSON.stringify(response),
      );

      if (!response?.data?._id) {
        throw new InternalServerErrorException(
          'OpenMAINT no pudo crear el usuario propietario',
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      console.error('[OpenMAINT] createOwnerUser - error:', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });

      // Propagamos el error original para que el caller pueda inspeccionar el status
      throw error;
    }
  }

  async createCorrectiveMaintIncident(
    body: OpenmaintCreateIncidentBody,
    sessionId: string,
  ) {
    try {
      console.log(
        '[OpenMAINT] createCorrectiveMaintIncident - payload:',
        JSON.stringify(body),
      );

      const response = (await this.client.post(
        '/processes/CorrectiveMaint/instances',
        body,
        sessionId,
      )) as OpenmaintIncidentResponse;

      console.log(
        '[OpenMAINT] createCorrectiveMaintIncident - response:',
        JSON.stringify(response),
      );

      if (response.success === false) {
        throw new InternalServerErrorException(
          'OpenMAINT no pudo crear el incidente',
        );
      }

      return response;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      console.error('[OpenMAINT] createCorrectiveMaintIncident - error:', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });

      throw new InternalServerErrorException(
        'Error al crear incidente en OpenMAINT',
      );
    }
  }

  extractIncidentId(response: OpenmaintIncidentResponse): number | null {
    return response.data?._id ?? response.data?.Id ?? response.data?.id ?? null;
  }

  async uploadIncidentAttachment(
    incidentId: number,
    image: UploadedImage,
    sessionId: string,
  ): Promise<boolean> {
    const formData = new FormData();

    formData.append('file', image.buffer, {
      filename: image.originalname,
      contentType: image.mimetype,
    });

    try {
      await this.client.post(
        `/processes/CorrectiveMaint/instances/${incidentId}/attachments`,
        formData,
        sessionId,
        {
          headers: formData.getHeaders(),
        },
      );

      return true;
    } catch {
      return false;
    }
  }
}
