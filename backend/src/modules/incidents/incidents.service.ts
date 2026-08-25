import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { extractRegisterNotes } from '../../common/utils/openmaint-register.util';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import {
  CM_DERIVED_ASSIGNED,
  resolveCorrectiveStatus,
} from '../maintenance-supervision/constants/corrective-maint.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import { CompleteIncidentDto } from './dto/complete-incident.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';

type UploadedImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

type OpenmaintIncidentListItem = {
  _id: number;
  Number: string;
  ShortDescr: string;
  _Priority_description_translation: string;
  /** Código estable del estado (`CM-Execution`, `CM-Assignment`, …). */
  _ProcessStatus_code?: string | null;
  _ProcessStatus_description_translation: string;
  _Site_description: string;
  OpeningDate: string;
  /** Fecha prevista de inicio que fija el supervisor al asignar. */
  ExpExecStartDate?: string | null;
  /** Inicio real. Vacío mientras el técnico no haya arrancado el trabajo. */
  ExecStartDate?: string | null;
};

type OpenmaintIncidentListResponse = {
  data?: OpenmaintIncidentListItem[];
};

type OpenmaintIncidentDetail = {
  _id: number;
  Number: string;
  ShortDescr: string;
  _Site_description?: string | null;
  Site_description?: string | null;
  /** Código estable del estado (`CM-Execution`, `CM-Assignment`, …). */
  _ProcessStatus_code?: string | null;
  _ProcessStatus_description?: string | null;
  ProcessStatus_description?: string | null;
  /** Inicio real. Vacío mientras el técnico no haya arrancado el trabajo. */
  ExecStartDate?: string | null;
  _Priority_description?: string | null;
  Priority_description?: string | null;
  OpeningDate?: string | null;
  Register?: string | null;
  // Los devuelve openMAINT en el detalle y hacen falta para notificar.
  _Requester_description?: string | null;
  _Assignee_description?: string | null;
  _Unit_description?: string | null;
  _Floor_description?: string | null;
};

type OpenmaintIncidentDetailResponse = {
  data?: OpenmaintIncidentDetail | OpenmaintIncidentDetail[];
};

type OpenmaintAttachment = {
  _id: string;
  name: string;
};

type OpenmaintTaskItem = {
  _id: string;
  writable?: boolean;
};

type OpenmaintAttachmentsResponse = {
  data?: OpenmaintAttachment[];
};

type OpenmaintIncidentTaskContext = {
  data?: OpenmaintIncidentTaskContextData;
};

type OpenmaintIncidentTaskContextData = {
  _id?: number;
  /** Código estable del estado (`CM-Execution`, `CM-Assignment`, …). */
  _ProcessStatus_code?: string | null;
  /** Inicio real. Vacío mientras el técnico no haya pulsado «Iniciar». */
  ExecStartDate?: string | null;
  ExecEndDate?: string | null;
  _tasklist?: OpenmaintTaskItem[];
};

type AttachmentPreviewResponse = {
  data?: {
    hasPreview?: boolean;
    dataUrl?: string;
  };
};

@Injectable()
export class IncidentsService {
  constructor(
    private readonly openmaintService: OpenmaintService,
    private readonly notificationsService: NotificationsService,
    private readonly pushDispatch: PushDispatchService,
  ) {}

  /**
   * Sella el inicio real del trabajo, que es lo que separa «Asignado» de
   * «Ejecución».
   *
   * OpenMAINT no tiene un paso para esto: al asignar, el correctivo ya entra en
   * CM03 y el módulo de supervisión vacía el `ExecStartDate` que se autorrellena
   * (ver `clearAutoFilledExecStart`). Este endpoint es el único momento en que
   * la aplicación lo escribe.
   *
   * Es idempotente a propósito: si ya hay un inicio no se pisa, porque
   * reescribirlo acortaría la duración del trabajo ya registrada.
   */
  async startIncident(id: number, sessionId: string) {
    const { incident, activityId } = await this.getIncidentActivity(
      id,
      sessionId,
    );

    const statusCode = resolveCorrectiveStatus(
      incident._ProcessStatus_code,
      incident.ExecStartDate,
    );

    if (incident.ExecStartDate) {
      // Ya estaba en marcha: se devuelve el inicio original sin tocar nada.
      return {
        success: true,
        alreadyStarted: true,
        statusCode,
        execStartDate: incident.ExecStartDate,
        message: 'El trabajo ya estaba iniciado',
      };
    }

    if (statusCode !== CM_DERIVED_ASSIGNED) {
      throw new BadRequestException(
        'Solo se puede iniciar un incidente asignado y pendiente de arrancar',
      );
    }

    const execStartDate = new Date().toISOString();

    try {
      await this.openmaintService.startIncident(
        id,
        activityId,
        execStartDate,
        sessionId,
      );
    } catch (error) {
      if (this.getErrorStatus(error) === 404) {
        throw new NotFoundException('Incidente no encontrado');
      }

      throw new BadGatewayException(
        'Error al registrar el inicio del incidente en OpenMAINT',
      );
    }

    return {
      success: true,
      alreadyStarted: false,
      statusCode: 'Execution',
      execStartDate,
      message: 'Trabajo iniciado correctamente',
    };
  }

  async completeIncident(
    id: number,
    sessionId: string,
    dto: CompleteIncidentDto,
    file?: UploadedImage,
  ) {
    const { incident, activityId } = await this.getIncidentActivity(
      id,
      sessionId,
    );

    // El parte necesita inicio y fin para tener duración. La API de OpenMAINT
    // no lo valida — avanza igual y deja el trabajo cerrado sin fechas —, así
    // que el corte se hace aquí.
    if (!incident.ExecStartDate) {
      throw new BadRequestException(
        'Hay que iniciar el trabajo antes de finalizarlo',
      );
    }

    await this.advanceIncident(
      id,
      activityId,
      dto.notes?.trim() || null,
      new Date().toISOString(),
      sessionId,
    );

    if (file) {
      try {
        await this.uploadAttachment(id, file, sessionId);
      } catch (error) {
        console.error('Error al subir evidencia de cierre a OpenMAINT', error);
      }
    }

    // Enviar notificación de cierre en segundo plano
    this.sendIncidentFinishedNotificationInBackground(id, sessionId).catch(
      (err) => {
        console.error(
          'Error enviando notificación de incidente finalizado:',
          err,
        );
      },
    );

    return {
      success: true,
      message: 'Incidente completado correctamente',
    };
  }

  async getIncidentDetail(id: number, sessionId: string) {
    let response: OpenmaintIncidentDetailResponse;

    try {
      response = (await this.openmaintService.getIncidentDetail(
        id,
        sessionId,
      )) as OpenmaintIncidentDetailResponse;
    } catch {
      throw new InternalServerErrorException(
        'No se pudo obtener el detalle del incidente',
      );
    }

    const incident = this.normalizeIncidentDetail(response);

    if (!incident) {
      throw new InternalServerErrorException(
        'No se pudo obtener el detalle del incidente',
      );
    }

    let attachments: OpenmaintAttachment[] = [];

    try {
      const attachmentsResponse =
        (await this.openmaintService.getIncidentAttachments(
          id,
          sessionId,
        )) as OpenmaintAttachmentsResponse;

      attachments = attachmentsResponse.data ?? [];
    } catch {
      attachments = [];
    }

    const imageAttachments = attachments.filter((attachment) =>
      /\.(png|jpg|jpeg|webp)$/i.test(attachment.name),
    );

    const previewResults = await Promise.allSettled(
      imageAttachments.map((attachment) =>
        this.openmaintService.getAttachmentPreview(
          id,
          attachment._id,
          sessionId,
        ),
      ),
    );

    const images = previewResults
      .filter(
        (result): result is PromiseFulfilledResult<AttachmentPreviewResponse> =>
          result.status === 'fulfilled' &&
          result.value?.data?.hasPreview === true &&
          typeof result.value.data.dataUrl === 'string',
      )
      .map((result) => result.value.data!.dataUrl!);

    return {
      id: incident._id ?? null,
      number: incident.Number ?? null,
      location: incident.ShortDescr ?? null,
      building: incident._Site_description ?? incident.Site_description ?? null,
      // Código estable para la lógica; `status` queda como etiqueta visible.
      statusCode: resolveCorrectiveStatus(
        incident._ProcessStatus_code,
        incident.ExecStartDate,
      ),
      status:
        incident._ProcessStatus_description ??
        incident.ProcessStatus_description ??
        null,
      priority:
        incident._Priority_description ?? incident.Priority_description ?? null,
      createdAt: incident.OpeningDate ?? null,
      notes: extractRegisterNotes(incident.Register ?? null),
      requesterName: incident._Requester_description ?? null,
      assigneeName: incident._Assignee_description ?? null,
      unit: incident._Unit_description ?? null,
      floor: incident._Floor_description ?? null,
      images,
    };
  }

  async getMyIncidents(employeeId: number, sessionId: string) {
    let response: OpenmaintIncidentListResponse;

    try {
      response = (await this.openmaintService.getIncidentsByAssignee(
        sessionId,
        employeeId,
      )) as OpenmaintIncidentListResponse;
    } catch {
      throw new BadGatewayException(
        'Error al consultar incidentes en OpenMAINT',
      );
    }

    return {
      incidents: (response.data ?? []).map((incident) => ({
        id: incident._id,
        number: incident.Number,
        location: incident.ShortDescr,
        priority: incident._Priority_description_translation,
        // El código estable es el que debe gobernar la lógica del front.
        // `_ProcessStatus_description_translation` viaja traducido según el
        // idioma de la sesión, así que solo sirve como etiqueta visible.
        // Se deriva con la misma regla que usa el supervisor, para que los dos
        // roles vean el mismo estado: «Asignado» mientras no haya inicio real.
        statusCode: resolveCorrectiveStatus(
          incident._ProcessStatus_code,
          incident.ExecStartDate,
        ),
        status: incident._ProcessStatus_description_translation,
        building: incident._Site_description,
        createdAt: incident.OpeningDate,
        plannedStart: incident.ExpExecStartDate ?? null,
      })),
    };
  }

  async createIncident(
    sessionId: string,
    employeeId: number,
    dto: CreateIncidentDto,
    images: UploadedImage[] = [],
  ) {
    const incidentResponse =
      await this.openmaintService.createCorrectiveMaintIncident(
        {
          _type: 'CorrectiveMaint',
          _activity: 'CM01-Opening',
          _advance: true,
          OpeningDate: new Date().toISOString(),
          ShortDescr: dto.floorArea,
          ProcessNotes: dto.notes,
          Requester: employeeId,
          Type: 268288,
          Priority: dto.priority,
          Site: dto.buildingId,
          // Solo se envían si el usuario los eligió; son opcionales en OpenMAINT
          ...(dto.floorId ? { Floor: dto.floorId } : {}),
          ...(dto.unitId ? { Unit: dto.unitId } : {}),
          ...(dto.commonAreaId ? { CommonArea: dto.commonAreaId } : {}),
          Category: 1460015,
          Subcategory: 1460074,
          ProcessStatus: 277461,
        },
        sessionId,
      );

    const incidentId =
      this.openmaintService.extractIncidentId(incidentResponse);

    if (!incidentId) {
      throw new InternalServerErrorException(
        'No se pudo obtener el identificador del incidente creado',
      );
    }

    const attachmentResults =
      images.length > 0
        ? await Promise.allSettled(
            images.map((image) =>
              this.openmaintService.uploadIncidentAttachment(
                incidentId,
                image,
                sessionId,
              ),
            ),
          )
        : [];

    const attachmentsUploaded = attachmentResults.filter(
      (result) => result.status === 'fulfilled' && result.value,
    ).length;

    const attachmentsFailed = attachmentResults.length - attachmentsUploaded;

    // Enviar notificación en segundo plano de manera asíncrona
    this.sendIncidentNotificationInBackground(
      incidentId,
      employeeId,
      dto,
      sessionId,
    ).catch((err) => {
      console.error(
        'Error no controlado al iniciar la notificación del incidente:',
        err,
      );
    });

    return {
      incidentId,
      requester: employeeId,
      buildingId: dto.buildingId,
      attachmentsUploaded,
      attachmentsFailed,
    };
  }

  private async sendIncidentNotificationInBackground(
    incidentId: number,
    employeeId: number,
    dto: CreateIncidentDto,
    sessionId: string,
  ): Promise<void> {
    try {
      // 1. Obtener detalles del incidente para el número y nombre del edificio
      const incidentDetail = await this.getIncidentDetail(
        incidentId,
        sessionId,
      );
      const incidentNumber = incidentDetail?.number || String(incidentId);
      const locationName = incidentDetail?.location || '';
      const buildingName = incidentDetail?.building || '';
      const statusName = incidentDetail?.status || '';
      const priorityName = incidentDetail?.priority || '';
      const createdAt = incidentDetail?.createdAt || '';
      const notes = incidentDetail?.notes || '';
      const images = incidentDetail?.images || [];

      // 3. Enviar notificación por correo
      await this.notificationsService.notifyIncidentCreated(
        incidentId,
        incidentNumber,
        locationName,
        buildingName,
        statusName,
        priorityName,
        createdAt,
        notes,
        images,
      );

      // Push a los supervisores de mantenimiento (apertura).
      await this.pushDispatch.notifyCorrectiveOpened({
        id: incidentId,
        requesterName: incidentDetail?.requesterName,
        unitName: incidentDetail?.unit,
        floorName: incidentDetail?.floor,
        buildingName: incidentDetail?.building,
      });
    } catch (error) {
      console.error(
        'Error al enviar la notificación del incidente en segundo plano:',
        error,
      );
    }
  }

  // Nueva función para notificación al cerrar incidente
  private async sendIncidentFinishedNotificationInBackground(
    incidentId: number,
    sessionId: string,
  ): Promise<void> {
    try {
      const incidentDetail = await this.getIncidentDetail(
        incidentId,
        sessionId,
      );
      const incidentNumber = incidentDetail?.number || String(incidentId);
      const locationName = incidentDetail?.location || '';
      const buildingName = incidentDetail?.building || '';
      const statusName = incidentDetail?.status || '';
      const priorityName = incidentDetail?.priority || '';
      const createdAt = incidentDetail?.createdAt || '';
      const notes = incidentDetail?.notes || '';
      const images = incidentDetail?.images || [];

      await this.notificationsService.notifyIncidentFinished(
        incidentId,
        incidentNumber,
        locationName,
        buildingName,
        statusName,
        priorityName,
        createdAt,
        notes,
        images,
      );

      // Push a los supervisores de mantenimiento (pasa a Contabilidad).
      await this.pushDispatch.notifyCorrectiveCompleted({
        id: incidentId,
        assigneeName: incidentDetail?.assigneeName,
        unitName: incidentDetail?.unit,
        floorName: incidentDetail?.floor,
        buildingName: incidentDetail?.building,
      });
    } catch (error) {
      console.error(
        'Error al enviar la notificación de incidente finalizado en segundo plano:',
        error,
      );
    }
  }

  /**
   * La instancia junto al `_id` de su actividad activa, que es lo que hay que
   * mandar en `_activity` para escribir o avanzar el flujo.
   *
   * Devuelve las dos cosas porque quien avanza el flujo casi siempre necesita
   * también mirar el estado o las fechas antes de hacerlo.
   */
  private async getIncidentActivity(
    id: number,
    sessionId: string,
  ): Promise<{
    incident: OpenmaintIncidentTaskContextData;
    activityId: string;
  }> {
    let response: OpenmaintIncidentTaskContext;

    try {
      response = (await this.openmaintService.getIncidentWithTask(
        id,
        sessionId,
      )) as OpenmaintIncidentTaskContext;
    } catch (error) {
      const status = this.getErrorStatus(error);

      if (status === 404) {
        throw new NotFoundException('Incidente no encontrado');
      }

      throw new BadGatewayException(
        'Error al obtener la actividad actual del incidente en OpenMAINT',
      );
    }

    const incident = response.data;
    const task = incident?._tasklist?.[0];

    if (!incident || !task) {
      throw new BadRequestException(
        'El incidente no tiene una actividad disponible para cierre',
      );
    }

    return { incident, activityId: task._id };
  }

  private async uploadAttachment(
    incidentId: number,
    file: UploadedImage,
    sessionId: string,
  ) {
    try {
      await this.openmaintService.uploadCompletionAttachment(
        incidentId,
        file,
        sessionId,
      );
    } catch {
      throw new BadGatewayException(
        'Error al subir la evidencia del incidente a OpenMAINT',
      );
    }
  }

  private async advanceIncident(
    incidentId: number,
    activityId: string,
    notes: string | null,
    execEndDate: string,
    sessionId: string,
  ) {
    try {
      await this.openmaintService.completeIncident(
        incidentId,
        activityId,
        notes,
        execEndDate,
        sessionId,
      );
    } catch (error) {
      const status = this.getErrorStatus(error);

      if (status === 404) {
        throw new NotFoundException('Incidente no encontrado');
      }

      throw new BadGatewayException(
        'Error al finalizar el incidente en OpenMAINT',
      );
    }
  }

  private normalizeIncidentDetail(
    response: OpenmaintIncidentDetailResponse | OpenmaintIncidentDetail | null,
  ): OpenmaintIncidentDetail | null {
    if (!response) {
      return null;
    }

    const rawData =
      'data' in response && response.data !== undefined
        ? response.data
        : response;

    if (Array.isArray(rawData)) {
      return rawData[0] ?? null;
    }

    if (rawData && typeof rawData === 'object' && 'data' in rawData) {
      const nestedData = rawData.data;

      if (Array.isArray(nestedData)) {
        return nestedData[0] ?? null;
      }

      return (nestedData as OpenmaintIncidentDetail) ?? null;
    }

    return rawData as OpenmaintIncidentDetail;
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response &&
      typeof error.response.status === 'number'
    ) {
      return error.response.status;
    }

    return undefined;
  }
}
