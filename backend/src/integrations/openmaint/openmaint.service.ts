import {
  BadGatewayException,
  InternalServerErrorException,
  Injectable,
} from '@nestjs/common';
import FormData from 'form-data';
import { OpenmaintClient } from './openmaint.client';

type EmployeeCard = {
  _id: number;
};

type EmployeeCardsResponse = {
  data?: EmployeeCard[];
};

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
  Action: 'CM03-Advance';
  Outcome: number;
  ProcessNotes: string | null;
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

  async getIncidentsByRequester(sessionId: string, employeeId: number) {
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
        or: [
          {
            simple: {
              attribute: 'Requester',
              operator: 'equal',
              value: [employeeId],
            },
          },
          {
            simple: {
              attribute: 'Assignee',
              operator: 'equal',
              value: [employeeId],
            },
          },
        ],
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

  async completeIncident(
    incidentId: number,
    activityId: string,
    notes: string | null,
    sessionId: string,
  ) {
    const body: CompleteIncidentBody = {
      _id: incidentId,
      _type: 'CorrectiveMaint',
      _activity: activityId,
      _advance: true,
      Action: 'CM03-Advance',
      Outcome: 261326,
      ProcessNotes: notes,
    };

    return this.client.put(
      `/processes/CorrectiveMaint/instances/${incidentId}`,
      body,
      sessionId,
    );
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
