import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { extractRegisterNotes } from '../../common/utils/openmaint-register.util';
import {
  PM_ACTIONS,
  PM_ACTIVE_STATUS_IDS,
  PM_OUTCOME_POSITIVE,
  PM_STATUS_CODE_TO_NAME,
  PM_STATUS_IDS,
  PM_STATUS_NAME_TO_ID,
  PM_SUSPENSION_REASON_ATTR,
  PM_SUSPENSION_REASON_LOOKUP,
} from './constants/preventive-maint.constants';
import { CompletePreventiveMaintenanceDto } from './dto/complete-preventive-maintenance.dto';
import { GetHistoryQueryDto } from './dto/get-history-query.dto';
import { GetMyPreventiveMaintenancesQueryDto } from './dto/get-my-preventive-maintenances-query.dto';
import { SuspendPreventiveMaintenanceDto } from './dto/suspend-preventive-maintenance.dto';
import {
  ChecklistAnswer,
  PreventiveChecklistItem,
  PreventiveChecklistService,
} from './preventive-checklist.service';
import {
  PreventiveMaintAttachment,
  PreventiveMaintAttachmentPreviewResponse,
  PreventiveMaintAttachmentsResponse,
  PreventiveMaintCard,
  PreventiveMaintCardsResponse,
  PreventiveMaintenanceOpenmaintService,
  UploadedImage,
} from './preventive-maintenance.openmaint.service';
import { LookupOption, toLookupOption } from './utils/lookup-option.util';

const IMAGE_FILE_REGEX = /\.(png|jpg|jpeg|webp)$/i;

const LOCK_RETRIES = 3;
const LOCK_RETRY_DELAY_MS = 300;

/** Contrato público de un mantenimiento preventivo en el listado. */
export type PreventiveMaintenance = {
  id: number;
  number: string | null;
  subject: string | null;
  /** Identificador estable del estado, p. ej. `Execution` */
  statusCode: string | null;
  /** Etiqueta del estado traducida por OpenMAINT, p. ej. `Ejecución` */
  status: string | null;
  isClosed: boolean;
  isOverdue: boolean;
  site: string | null;
  /** Equipo/activo intervenido */
  equipment: string | null;
  /** Plan preventivo del que se generó */
  plan: string | null;
  team: string | null;
  assignee: string | null;
  openingDate: string | null;
  expectedStartDate: string | null;
  dueDate: string | null;
  execStartDate: string | null;
  execEndDate: string | null;
};

export type PreventiveMaintenanceDetail = PreventiveMaintenance & {
  notes: string | null;
  images: string[];
  /** El técnico puede cerrarlo (está en ejecución) */
  canComplete: boolean;
  /** El técnico puede suspenderlo; a diferencia del cierre no exige checklist */
  canSuspend: boolean;
  /** Motivo con el que se suspendió, si lo está */
  suspensionReason: string | null;
  /** Actividades a ejecutar; el cierre exige tenerlas todas resueltas */
  checklist: PreventiveChecklistItem[];
};

/** Mantenimiento ya cerrado sobre el mismo equipo. */
export type PreventiveMaintenanceHistoryEntry = PreventiveMaintenance & {
  /** Cuántos archivos dejó; alimenta la etiqueta «Informe generado» */
  attachmentCount: number;
};

export type PreventiveMaintenanceAttachment = {
  id: string;
  fileName: string;
  category: string | null;
  uploadDate: string | null;
  /** Ruta de este mismo backend, no de OpenMAINT */
  downloadUrl: string;
  isImage: boolean;
};

@Injectable()
export class PreventiveMaintenanceService {
  private readonly logger = new Logger(PreventiveMaintenanceService.name);

  constructor(
    private readonly openmaint: PreventiveMaintenanceOpenmaintService,
    private readonly checklist: PreventiveChecklistService,
  ) {}

  async getMyPreventiveMaintenances(
    sessionId: string,
    employeeId: number,
    query: GetMyPreventiveMaintenancesQueryDto,
  ) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    // Sin filtro explícito se muestran solo los pendientes de atender; los
    // completados y cancelados desaparecen del dashboard por sí solos.
    const statusIds = query.status
      ? [PM_STATUS_NAME_TO_ID[query.status]]
      : PM_ACTIVE_STATUS_IDS;

    let response: Awaited<
      ReturnType<PreventiveMaintenanceOpenmaintService['findByAssignee']>
    >;

    try {
      response = await this.openmaint.findByAssignee(sessionId, employeeId, {
        limit,
        offset,
        statusIds,
      });
    } catch (error) {
      this.throwIfSessionExpired(error);

      throw new BadGatewayException(
        'Error al consultar mantenimientos preventivos en OpenMAINT',
      );
    }

    const cards = response.data ?? [];

    return {
      success: true,
      data: cards.map((card) => this.toPreventiveMaintenance(card)),
      meta: {
        total: response.meta?.total ?? cards.length,
        limit,
        offset,
      },
    };
  }

  async getPreventiveMaintenanceDetail(sessionId: string, id: number) {
    const card = await this.fetchCard(sessionId, id);

    return { success: true, data: await this.toDetail(sessionId, card) };
  }

  /**
   * Abre el mantenimiento para el técnico: si está en Aceptación lo avanza a
   * Ejecución. Es idempotente — si ya está en ejecución o cerrado devuelve el
   * detalle sin tocar el flujo.
   *
   * Un mantenimiento suspendido no se reanuda desde aquí: esa transición se
   * hace en OpenMAINT.
   */
  async startExecution(sessionId: string, id: number) {
    const card = await this.fetchCardWithTasklist(sessionId, id);

    if (card.ProcessStatus === PM_STATUS_IDS.ACCEPTANCE) {
      const activityId = this.requireActivityId(card);

      this.logger.log(
        `Iniciando ejecución del mantenimiento preventivo ${card.Number ?? id}`,
      );

      if (
        await this.advanceToExecution(
          sessionId,
          id,
          activityId,
          PM_ACTIONS.START_EXECUTION,
        )
      ) {
        // La relectura valida el avance y da el `_activity` de PM03
        const executing = await this.fetchCardWithTasklist(sessionId, id);

        this.assertStatus(
          executing,
          PM_STATUS_IDS.EXECUTION,
          'OpenMAINT no aplicó el inicio de ejecución del mantenimiento preventivo',
        );

        await this.registerExecutionStart(sessionId, executing);
      }
    }

    const updated = await this.fetchCard(sessionId, id);

    // Al volver de una suspensión las actividades siguen marcadas como N.D.:
    // se limpian para que vuelvan a presentarse por completar.
    if (updated.ProcessStatus === PM_STATUS_IDS.EXECUTION) {
      await this.clearNotDoneOnResume(sessionId, id);
    }

    return { success: true, data: await this.toDetail(sessionId, updated) };
  }

  /** Guarda las respuestas del checklist y devuelve su estado actualizado. */
  async savePreventiveChecklist(
    sessionId: string,
    id: number,
    answers: ChecklistAnswer[],
  ) {
    // Valida que el mantenimiento exista y sea accesible antes de escribir
    await this.fetchCard(sessionId, id);

    const checklist = await this.checklist.saveChecklist(
      sessionId,
      id,
      answers,
    );

    return { success: true, data: { checklist } };
  }

  /** Cierra el mantenimiento (Ejecución → Completado) con notas y evidencia. */
  async completePreventiveMaintenance(
    sessionId: string,
    id: number,
    dto: CompletePreventiveMaintenanceDto,
    file?: UploadedImage,
  ) {
    const card = await this.fetchCardWithTasklist(sessionId, id);

    if (card.ProcessStatus !== PM_STATUS_IDS.EXECUTION) {
      throw new ConflictException(
        'Solo se puede finalizar un mantenimiento preventivo en ejecución',
      );
    }

    // OpenMAINT bloquea el cierre mientras queden actividades sin resolver, y
    // lo hace respondiendo 200 sin avanzar. Comprobarlo antes permite dar un
    // 409 accionable en lugar de un fallo opaco.
    await this.checklist.assertComplete(sessionId, id);

    const activityId = this.requireActivityId(card);
    const now = new Date().toISOString();

    await this.runAdvance(sessionId, id, {
      activityId,
      action: PM_ACTIONS.CONCLUDE,
      outcome: PM_OUTCOME_POSITIVE,
      notes: dto.notes?.trim() || null,
      // PM03 exige ambas fechas; sin ellas OpenMAINT responde 200, guarda los
      // atributos y deja el proceso en ejecución sin avisar. La de inicio es la
      // que se selló al abrir la tarjeta; la de fin es este mismo instante.
      fields: {
        ExecStartDate: card.ExecStartDate ?? now,
        ExecEndDate: now,
      },
    });

    // OpenMAINT bloquea el cierre mientras queden actividades del checklist
    // (`PrevMaintTasks.Data`) sin resultado, y lo hace respondiendo 200 sin
    // avanzar. Hasta que la app permita rellenar el checklist, ese es el
    // motivo más probable de que el cierre no se aplique.
    await this.assertReachedStatus(
      sessionId,
      id,
      PM_STATUS_IDS.COMPLETED,
      'OpenMAINT no aplicó el cierre. Revisa que el checklist del ' +
        'mantenimiento tenga todas sus actividades resueltas.',
    );

    // La evidencia es complementaria: si falla, el cierre ya está registrado.
    if (file) {
      try {
        await this.openmaint.uploadAttachment(sessionId, id, file);
      } catch (error) {
        this.logger.error(
          `No se pudo subir la evidencia del mantenimiento ${id}`,
          error,
        );
      }
    }

    return {
      success: true,
      message: 'Mantenimiento preventivo completado correctamente',
    };
  }

  /** Suspende el mantenimiento (Ejecución → Suspensión) con motivo y notas. */
  async suspendPreventiveMaintenance(
    sessionId: string,
    id: number,
    dto: SuspendPreventiveMaintenanceDto,
  ) {
    const card = await this.fetchCardWithTasklist(sessionId, id);

    if (card.ProcessStatus === PM_STATUS_IDS.SUSPENSION) {
      throw new ConflictException(
        'El mantenimiento preventivo ya está suspendido',
      );
    }

    if (card.ProcessStatus !== PM_STATUS_IDS.EXECUTION) {
      throw new ConflictException(
        'Solo se puede suspender un mantenimiento preventivo en ejecución',
      );
    }

    // El checklist no se autoguarda: lo que el técnico llevaba escrito solo
    // existe en su navegador y viaja en esta misma petición.
    if (dto.items?.length) {
      await this.checklist.saveChecklist(sessionId, id, dto.items);
    }

    // Antes del avance: PM03 no deja salir mientras queden actividades sin
    // resolver, y lo hace respondiendo 200 sin avanzar.
    const notDone = await this.checklist.markPendingAsNotDone(sessionId, id);

    await this.runAdvance(sessionId, id, {
      activityId: this.requireActivityId(card),
      action: PM_ACTIONS.SUSPEND,
      notes: dto.notes?.trim() || null,
      fields: { [PM_SUSPENSION_REASON_ATTR]: dto.reasonId },
    });

    await this.assertReachedStatus(
      sessionId,
      id,
      PM_STATUS_IDS.SUSPENSION,
      'OpenMAINT no aplicó la suspensión. Revisa que el motivo enviado sea válido.',
    );

    this.logger.log(
      `Mantenimiento ${card.Number ?? id} suspendido con ${notDone} actividades marcadas como N.D.`,
    );

    return {
      success: true,
      message: 'Mantenimiento preventivo suspendido correctamente',
    };
  }

  /** Opciones del desplegable "Motivo de suspensión". */
  async getSuspensionReasons(sessionId: string) {
    let reasons: LookupOption[];

    try {
      const response = await this.openmaint.findLookupValues(
        sessionId,
        PM_SUSPENSION_REASON_LOOKUP,
      );

      reasons = (response.data ?? [])
        .filter((value) => value.active !== false)
        .map((value) => toLookupOption(value));
    } catch (error) {
      this.throwIfSessionExpired(error);

      throw new BadGatewayException(
        'Error al consultar los motivos de suspensión en OpenMAINT',
      );
    }

    return { success: true, data: reasons };
  }

  /**
   * Mantenimientos preventivos ya completados sobre el mismo equipo, para dar
   * contexto de lo que se hizo antes. Excluye el mantenimiento consultado.
   */
  async getEquipmentHistory(
    sessionId: string,
    id: number,
    query: GetHistoryQueryDto,
  ) {
    const limit = query.limit ?? 10;
    const card = await this.fetchCard(sessionId, id);

    // `CISubset` es el equipo concreto; `CI` es el respaldo cuando el plan se
    // definió sobre el activo genérico.
    const equipmentAttr = card.CISubset != null ? 'CISubset' : 'CI';
    const equipmentId = card.CISubset ?? card.CI ?? null;
    const equipment =
      card._CISubset_description ?? card._CI_description ?? null;

    if (equipmentId === null) {
      return { success: true, data: [], meta: { total: 0, equipment: null } };
    }

    let response: PreventiveMaintCardsResponse;

    try {
      response = await this.openmaint.findByEquipment(sessionId, {
        equipmentAttr,
        equipmentId,
        // Uno de más: el propio mantenimiento puede caer dentro de la página
        limit: limit + 1,
        offset: 0,
        statusIds: [PM_STATUS_IDS.COMPLETED],
      });
    } catch (error) {
      this.throwIfSessionExpired(error);

      throw new BadGatewayException(
        'Error al consultar el historial del equipo en OpenMAINT',
      );
    }

    const cards = (response.data ?? [])
      .filter((previous) => previous._id !== id)
      .slice(0, limit);

    const attachments = await Promise.allSettled(
      cards.map((previous) =>
        this.openmaint.findAttachments(sessionId, previous._id),
      ),
    );

    return {
      success: true,
      data: cards.map((previous, index) => ({
        ...this.toPreventiveMaintenance(previous),
        attachmentCount: this.countAttachments(attachments[index]),
      })),
      meta: { total: cards.length, equipment },
    };
  }

  /** Archivos adjuntos de un mantenimiento, con su ruta de descarga. */
  async getAttachments(sessionId: string, id: number) {
    // Valida que el mantenimiento exista y sea accesible para la sesión
    await this.fetchCard(sessionId, id);

    let attachments: PreventiveMaintAttachment[];

    try {
      const response = await this.openmaint.findAttachments(sessionId, id);
      attachments = response.data ?? [];
    } catch (error) {
      this.throwIfSessionExpired(error);

      // Los adjuntos son complementarios: la vista sigue siendo útil sin ellos
      return { success: true, data: [], meta: { total: 0 } };
    }

    const data: PreventiveMaintenanceAttachment[] = attachments.map(
      (attachment) => {
        const fileName = attachment.fileName ?? attachment.name ?? 'adjunto';

        return {
          id: attachment._id,
          fileName,
          category:
            attachment._category_description ?? attachment.category ?? null,
          uploadDate: attachment.created ?? attachment.modified ?? null,
          downloadUrl: `/preventive-maintenance/${id}/attachments/${attachment._id}/download`,
          isImage: IMAGE_FILE_REGEX.test(fileName),
        };
      },
    );

    return { success: true, data, meta: { total: data.length } };
  }

  /** Reenvía el binario de un adjunto al navegador. */
  async streamAttachment(
    sessionId: string,
    id: number,
    attachmentId: string,
    res: Response,
  ): Promise<void> {
    let file: Awaited<
      ReturnType<PreventiveMaintenanceOpenmaintService['downloadAttachment']>
    >;

    try {
      file = await this.openmaint.downloadAttachment(
        sessionId,
        id,
        attachmentId,
      );
    } catch (error) {
      this.throwIfSessionExpired(error);

      const status = this.getErrorStatus(error);

      if (status === 404 || status === 400) {
        throw new NotFoundException('Adjunto no encontrado');
      }

      throw new BadGatewayException(
        'Error al descargar el adjunto desde OpenMAINT',
      );
    }

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${this.decodeFileName(file.fileName)}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(file.data);
  }

  /**
   * OpenMAINT devuelve el nombre form-encoded en el `Content-Disposition`, así
   * que sin esto el navegador guarda «Informe+de+actividades.pdf».
   */
  private decodeFileName(fileName: string): string {
    try {
      return decodeURIComponent(fileName.replace(/\+/g, ' '));
    } catch {
      return fileName;
    }
  }

  // ── Acceso a OpenMAINT ─────────────────────────────────────────────────────

  private async fetchCard(
    sessionId: string,
    id: number,
  ): Promise<PreventiveMaintCard> {
    return this.unwrapCard(
      () => this.openmaint.findById(sessionId, id),
      'Error al consultar el mantenimiento preventivo en OpenMAINT',
    );
  }

  private async fetchCardWithTasklist(
    sessionId: string,
    id: number,
  ): Promise<PreventiveMaintCard> {
    return this.unwrapCard(
      () => this.openmaint.findWithTasklist(sessionId, id),
      'Error al obtener la actividad actual del mantenimiento en OpenMAINT',
    );
  }

  private async unwrapCard(
    fetch: () => Promise<{ data?: PreventiveMaintCard }>,
    gatewayMessage: string,
  ): Promise<PreventiveMaintCard> {
    let card: PreventiveMaintCard | undefined;

    try {
      const response = await fetch();
      card = response.data;
    } catch (error) {
      this.throwIfSessionExpired(error);

      // El único dato que aporta el cliente es el id, así que un rechazo por
      // petición inválida sólo puede significar que ese id no existe o no es
      // accesible para la sesión.
      const status = this.getErrorStatus(error);

      if (status === 404 || status === 400) {
        throw new NotFoundException('Mantenimiento preventivo no encontrado');
      }

      throw new BadGatewayException(gatewayMessage);
    }

    if (!card) {
      throw new NotFoundException('Mantenimiento preventivo no encontrado');
    }

    return card;
  }

  /**
   * Lleva el mantenimiento a Ejecución, ya venga de Aceptación o de Suspensión.
   * Dos peticiones a la vez compiten por el bloqueo del proceso en OpenMAINT y
   * una falla; si la otra ya lo dejó en ejecución, el resultado está conseguido.
   *
   * @returns `true` si fue esta petición la que avanzó, y por tanto la que debe
   * sellar la hora de inicio o limpiar el N.D.
   */
  private async advanceToExecution(
    sessionId: string,
    id: number,
    activityId: string,
    action: number,
  ): Promise<boolean> {
    try {
      await this.runAdvance(sessionId, id, { activityId, action });

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (!(await this.waitUntilExecuting(sessionId, id))) {
        throw error;
      }

      this.logger.warn(
        `El avance de ${id} falló pero otra petición simultánea ya lo dejó en ejecución`,
      );

      return false;
    }
  }

  /**
   * Espera a que la petición que ganó el bloqueo confirme el avance: cuando la
   * nuestra falla, la suya todavía puede estar sin escribir.
   */
  private async waitUntilExecuting(
    sessionId: string,
    id: number,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));

      const card = await this.fetchCard(sessionId, id);

      if (card.ProcessStatus === PM_STATUS_IDS.EXECUTION) {
        return true;
      }
    }

    return false;
  }

  private async runAdvance(
    sessionId: string,
    id: number,
    options: Parameters<PreventiveMaintenanceOpenmaintService['advance']>[2],
  ): Promise<void> {
    try {
      await this.openmaint.advance(sessionId, id, options);
    } catch (error) {
      this.throwIfSessionExpired(error);

      throw new BadGatewayException(
        'Error al avanzar el mantenimiento preventivo en OpenMAINT',
      );
    }
  }

  /**
   * OpenMAINT responde 200 a un `_advance` aunque no avance (por ejemplo si
   * falta un atributo obligatorio del paso): guarda los atributos y deja el
   * proceso donde estaba. Sin esta comprobación le diríamos al técnico que su
   * mantenimiento quedó cerrado cuando en realidad sigue abierto.
   */
  private async assertReachedStatus(
    sessionId: string,
    id: number,
    expectedStatus: number,
    reason: string,
  ): Promise<void> {
    this.assertStatus(
      await this.fetchCard(sessionId, id),
      expectedStatus,
      reason,
    );
  }

  private assertStatus(
    card: PreventiveMaintCard,
    expectedStatus: number,
    reason: string,
  ): void {
    if (card.ProcessStatus === expectedStatus) {
      return;
    }

    this.logger.error(
      `OpenMAINT aceptó el avance de ${card.Number ?? card._id} pero el proceso sigue en ` +
        `${card._ProcessStatus_code ?? card.ProcessStatus}`,
    );

    throw new BadGatewayException(reason);
  }

  /**
   * Sella la hora real de inicio. `ExecStartDate` solo es escribible en PM03,
   * así que no puede viajar con el avance: OpenMAINT lo rellena al entrar con
   * la fecha *prevista* y aquí se sobrescribe con la real.
   *
   * Un fallo no interrumpe al técnico —el mantenimiento ya está en ejecución— y
   * el cierre volverá a enviar una fecha de inicio válida.
   */
  private async registerExecutionStart(
    sessionId: string,
    card: PreventiveMaintCard,
  ): Promise<void> {
    try {
      await this.openmaint.saveFields(sessionId, card._id, {
        activityId: this.requireActivityId(card),
        fields: { ExecStartDate: new Date().toISOString() },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la hora de inicio del mantenimiento ${card.Number ?? card._id}`,
        error,
      );
    }
  }

  /**
   * Devuelve a pendientes las actividades que se marcaron N.D. al suspender.
   * No escribe nada si no hay ninguna. Un fallo no interrumpe al técnico, pero
   * dejaría esas actividades contando como resueltas.
   */
  private async clearNotDoneOnResume(
    sessionId: string,
    id: number,
  ): Promise<void> {
    try {
      const cleared = await this.checklist.clearNotDone(sessionId, id);

      this.logger.log(
        `Reanudado ${id}: ${cleared} actividades vuelven a estar por completar`,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo limpiar el N.D. del checklist del mantenimiento ${id}`,
        error,
      );
    }
  }

  /** `_id` de la tarea activa del flujo, necesario para avanzarlo. */
  private requireActivityId(card: PreventiveMaintCard): string {
    const activityId = card._tasklist?.[0]?._id;

    if (!activityId) {
      throw new BadRequestException(
        'El mantenimiento preventivo no tiene una actividad disponible',
      );
    }

    return activityId;
  }

  // ── Mapeo al contrato público ──────────────────────────────────────────────

  private async toDetail(
    sessionId: string,
    card: PreventiveMaintCard,
  ): Promise<PreventiveMaintenanceDetail> {
    const [images, checklist] = await Promise.all([
      this.getAttachmentImages(sessionId, card._id),
      this.checklist.getChecklist(sessionId, card._id),
    ]);

    return {
      ...this.toPreventiveMaintenance(card),
      notes: extractRegisterNotes(card.Register ?? card._Register_html ?? null),
      images,
      canComplete: card.ProcessStatus === PM_STATUS_IDS.EXECUTION,
      canSuspend: card.ProcessStatus === PM_STATUS_IDS.EXECUTION,
      suspensionReason:
        card._SuspensionReason_description_translation ??
        card._SuspensionReason_description ??
        null,
      checklist,
    };
  }

  /** Traduce una instancia de OpenMAINT al contrato público del módulo. */
  private toPreventiveMaintenance(
    card: PreventiveMaintCard,
  ): PreventiveMaintenance {
    const statusCode = card._ProcessStatus_code ?? null;
    const dueDate = card.DueExecEndDate ?? null;
    const isClosed = (card._FlowStatus_code ?? '').startsWith('closed');

    return {
      id: card._id,
      number: card.Number ?? null,
      subject: card.ShortDescr ?? null,
      statusCode: statusCode
        ? (PM_STATUS_CODE_TO_NAME[statusCode] ?? statusCode)
        : null,
      status:
        card._ProcessStatus_description_translation ??
        card._ProcessStatus_description ??
        null,
      isClosed,
      isOverdue: this.isOverdue(dueDate, isClosed),
      site: card._Site_description ?? null,
      equipment: card._CISubset_description ?? card._CI_description ?? null,
      plan: card._PrevMaintConfig_description ?? null,
      team: card._Team_description ?? null,
      assignee: card._Assignee_description ?? null,
      openingDate: card.OpeningDate ?? null,
      expectedStartDate: card.ExpExecStartDate ?? null,
      dueDate,
      execStartDate: card.ExecStartDate ?? null,
      execEndDate: card.ExecEndDate ?? null,
    };
  }

  /** Un preventivo está vencido si sigue abierto y ya pasó su fecha límite. */
  private isOverdue(dueDate: string | null, isClosed: boolean): boolean {
    if (isClosed || !dueDate) {
      return false;
    }

    const due = new Date(dueDate).getTime();

    return Number.isFinite(due) && due < Date.now();
  }

  /**
   * Descarga las vistas previas de los adjuntos de imagen como data URLs.
   * Los adjuntos son complementarios: si fallan, el detalle se devuelve igual.
   */
  private async getAttachmentImages(
    sessionId: string,
    id: number,
  ): Promise<string[]> {
    let attachments: PreventiveMaintAttachment[] = [];

    try {
      const response = await this.openmaint.findAttachments(sessionId, id);
      attachments = response.data ?? [];
    } catch {
      return [];
    }

    const images = attachments.filter((attachment) =>
      IMAGE_FILE_REGEX.test(attachment.name ?? attachment.fileName ?? ''),
    );

    const previews = await Promise.allSettled(
      images.map((attachment) =>
        this.openmaint.findAttachmentPreview(sessionId, id, attachment._id),
      ),
    );

    return previews
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<PreventiveMaintAttachmentPreviewResponse> =>
          result.status === 'fulfilled' &&
          result.value?.data?.hasPreview === true &&
          typeof result.value.data.dataUrl === 'string',
      )
      .map((result) => result.value.data!.dataUrl!);
  }

  /** Un fallo al contar los archivos de un mantenimiento no invalida su fila. */
  private countAttachments(
    result: PromiseSettledResult<PreventiveMaintAttachmentsResponse>,
  ): number {
    return result.status === 'fulfilled' ? (result.value.data?.length ?? 0) : 0;
  }

  // ── Errores ────────────────────────────────────────────────────────────────

  /**
   * Propaga el 401 de OpenMAINT tal cual en lugar de enmascararlo como 502.
   * El frontend usa ese status para redirigir al login cuando la sesión caduca;
   * si se traduce a 502 el usuario queda atascado con un error genérico.
   */
  private throwIfSessionExpired(error: unknown): void {
    if (this.getErrorStatus(error) === 401) {
      throw new UnauthorizedException('La sesión de OpenMAINT ha expirado');
    }
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
