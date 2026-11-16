import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describeError } from '../../common/logging/describe-error.util';
import {
  MaintCategoryCatalogService,
  MaintSubcategory,
} from '../../integrations/openmaint/maint-category-catalog.service';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import {
  CleaningSupervisionsOpenmaintService,
  FindingCard,
  SupervisionCard,
} from './cleaning-supervisions.openmaint.service';
import {
  AttachmentCard,
  CleaningTaskCard,
  CleaningTasksOpenmaintService,
} from './cleaning-tasks.openmaint.service';
import { PHASE_IDS } from './constants/phase.constants';
import { isCoordinatorRole } from './constants/roles.constants';
import {
  CLEANING_CATEGORY_CODE,
  FINDING_PHOTO_PREFIX,
  FIX_PHOTO_PREFIX,
  isFixPhoto,
  isOpenSupervisionPhase,
  isSupervisionPanelRole,
  MAX_FINDING_PHOTOS,
  MAX_FIX_PHOTOS,
  SUPERVISION_PHASES,
  SupervisionPhase,
  SupervisionUnavailableReason,
} from './constants/supervision.constants';
import {
  AssignCorrectorDto,
  CreateFindingDto,
  UpdateFindingDto,
} from './dto/cleaning-supervision.dto';
import { readCsvTemplate } from './utils/csv-template.util';
import {
  assertValidPhoto,
  buildUniqueFileName,
  UploadedFile,
} from './utils/photo-upload.util';
import {
  groupPointsByArea,
  parseSupervisionChecklist,
  SupervisionPoint,
} from './utils/supervision-checklist.util';
import { stripDraftObservations } from './utils/team-observations.util';

/** Quién llama, resuelto desde su sesión de openMAINT (nunca desde cabeceras del cliente). */
type Viewer =
  | { kind: 'panel'; role: string }
  | { kind: 'coordinator'; role: string }
  | { kind: 'operator'; employeeId: number };

export type SupervisionSummary = {
  id: number;
  phase: SupervisionPhase | null;
  phaseLabel: string | null;
  corrector: { id: number; name: string } | null;
};

/** El checklist de supervisión cambia muy poco; se relee cada 5 minutos. */
const TEMPLATE_CACHE_MS = 5 * 60_000;

const unavailableMessages: Record<SupervisionUnavailableReason, string> = {
  superseded:
    'La unidad ya tiene una limpieza más reciente; esta ya no se puede supervisar.',
  reviewed: 'La limpieza ya fue revisada y no tiene supervisión.',
};

const taskPhase = (task: CleaningTaskCard): string =>
  task._phase_description ?? String(task.phase);

const timeOf = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const time = Date.parse(iso);
  return isNaN(time) ? null : time;
};

/**
 * Supervisión posterior de limpieza.
 *
 * Una `CleaningSupervision` por revisión y una `CleaningFinding` por novedad.
 * La limpieza se queda en `Completed` durante las correcciones y pasa a
 * `Reviewed` solo al aprobar la unidad.
 *
 * Reglas que vienen del plan (revisión del 14/11/2026):
 * - El borrador nace al finalizar la limpieza. Abrir una limpieza `Completed`
 *   desde el panel lo recupera (o lo crea) si tiene fecha de fin y nadie
 *   limpió la unidad después. No hay fecha de corte: el panel solo lista los
 *   últimos 7 días, pero el backend no limita.
 * - Crear un borrador anula los borradores anteriores de la misma unidad.
 * - Panel y acciones de supervisión: solo `SupervisorLimpieza`. Coordinación
 *   lee. El operario ve y resuelve solo lo suyo en `InCorrection`.
 *
 * Toda la escritura va con la sesión de servicio; por eso cada método valida
 * el rol y la propiedad antes de tocar openMAINT.
 */
@Injectable()
export class CleaningSupervisionsService {
  private readonly logger = new Logger(CleaningSupervisionsService.name);
  private readonly templateCache = new Map<
    number,
    { points: SupervisionPoint[]; expiresAt: number }
  >();

  constructor(
    private readonly gateway: CleaningSupervisionsOpenmaintService,
    private readonly tasksGateway: CleaningTasksOpenmaintService,
    private readonly openmaintService: OpenmaintService,
    private readonly sessionRoleService: SessionRoleService,
    private readonly categories: MaintCategoryCatalogService,
    private readonly pushDispatch: PushDispatchService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Ciclo de vida ligado a la limpieza ─────────────────────────────────────

  /**
   * Crea el borrador al finalizar una limpieza. Lo llama `completeTask` después
   * de escribir la fase: si falla, la limpieza ya está `Completed` y el
   * borrador se recupera al abrirla desde el panel.
   */
  async createDraftAfterCompletion(
    task: CleaningTaskCard,
    actualEndTime: string,
  ): Promise<SupervisionCard> {
    const existing = await this.gateway.findByTask(task._id);
    const open = existing.find((s) => isOpenSupervisionPhase(this.phaseOf(s)));
    if (open) return open;
    return this.createDraft(task, actualEndTime);
  }

  /** Reabrir la limpieza anula su supervisión abierta; el registro y sus fotos se conservan. */
  async cancelOpenForTask(taskId: number): Promise<number[]> {
    const supervisions = await this.gateway.findByTask(taskId);
    const open = supervisions.filter((s) =>
      isOpenSupervisionPhase(this.phaseOf(s)),
    );
    if (open.length === 0) return [];
    const cancelledId = await this.gateway.phaseId(
      SUPERVISION_PHASES.CANCELLED,
    );
    for (const supervision of open) {
      await this.gateway.updateSupervision(supervision._id, {
        Phase: cancelledId,
      });
    }
    return open.map((s) => s._id);
  }

  /**
   * Última supervisión de cada limpieza, para los listados. Nunca rompe el
   * listado: si openMAINT falla, devuelve un mapa vacío.
   */
  async summariesByTask(): Promise<Map<number, SupervisionSummary>> {
    const map = new Map<number, SupervisionSummary>();
    try {
      const recent = await this.gateway.findRecent();
      // Vienen de la más nueva a la más vieja: la primera de cada limpieza gana.
      for (const supervision of recent) {
        const taskId = supervision.CleaningTask;
        if (taskId && !map.has(taskId)) {
          map.set(taskId, this.toSummary(supervision));
        }
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron resumir las supervisiones para el listado: ${describeError(error)}`,
      );
    }
    return map;
  }

  /** Última supervisión de una limpieza, para su ficha. */
  async summaryForTask(taskId: number): Promise<SupervisionSummary | null> {
    try {
      const [latest] = await this.gateway.findByTask(taskId);
      return latest ? this.toSummary(latest) : null;
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la supervisión de la limpieza ${taskId}: ${describeError(error)}`,
      );
      return null;
    }
  }

  // ─── Panel de SupervisorLimpieza ────────────────────────────────────────────

  /** Áreas y puntos del checklist de supervisión vigente. */
  async getTemplate(sessionToken: string) {
    await this.requirePanel(sessionToken);
    const card = await this.gateway.findTemplateCard();
    if (!card) {
      throw new NotFoundException(
        'No existe el checklist de supervisión (Code = SUPERVISION)',
      );
    }
    const points = await this.templatePoints(card._id);
    return {
      success: true,
      data: {
        checklistId: card._id,
        description: card.Description ?? null,
        totalPoints: points.length,
        areas: groupPointsByArea(points),
      },
    };
  }

  /**
   * Devuelve la supervisión abierta de una limpieza o crea su borrador.
   * Solo lo crea si la limpieza tiene fecha de fin y la unidad no se volvió a
   * limpiar; si no, 409 con el motivo (o 400 sin fecha de fin).
   */
  async openForTask(taskId: number, sessionToken: string) {
    const viewer = await this.requirePanel(sessionToken);
    const task = (await this.tasksGateway.getTaskByIdWithSession(taskId))?.data;
    if (!task) throw new NotFoundException(`Limpieza ${taskId} no encontrada`);

    const supervisions = await this.gateway.findByTask(taskId);
    const open = supervisions.find((s) =>
      isOpenSupervisionPhase(this.phaseOf(s)),
    );
    if (open) return this.buildDetail(open, viewer);

    const phase = taskPhase(task);
    if (phase === 'Reviewed') {
      // Una limpieza revisada conserva su revisión: no se crea otra.
      if (supervisions[0]) return this.buildDetail(supervisions[0], viewer);
      this.unavailable('reviewed');
    }
    if (phase !== 'Completed') {
      throw new BadRequestException(
        `Solo se supervisa una limpieza Completed. Estado actual: ${phase}`,
      );
    }

    // Sin fin no se puede saber si la superaron, y `cancelSupersededDrafts` la
    // tomaría por la más nueva y anularía los borradores de toda la unidad.
    const end = timeOf(task.ActualEndTime);
    if (end === null) {
      throw new BadRequestException(
        'La limpieza no tiene fecha de finalización; no se puede supervisar.',
      );
    }
    if (await this.isSuperseded(task, end)) {
      this.unavailable('superseded');
    }

    const created = await this.createDraft(task, task.ActualEndTime as string);
    return this.buildDetail(created, viewer);
  }

  async getDetail(id: number, sessionToken: string) {
    const viewer = await this.resolveViewer(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertCanRead(supervision, viewer);
    return this.buildDetail(supervision, viewer);
  }

  /** Asigna como Supervisor la ficha InternalEmployee del usuario conectado. */
  async start(id: number, sessionToken: string) {
    const viewer = await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [SUPERVISION_PHASES.DRAFT]);

    const session = await this.openmaintService.getSession(sessionToken);
    const userId = session?.userId;
    const employeeId =
      typeof userId === 'number'
        ? await this.openmaintService.resolveEmployeeId(userId, sessionToken)
        : null;
    if (!employeeId) {
      throw new ForbiddenException(
        'Tu usuario no tiene una ficha de empleado (LoginUser) en openMAINT',
      );
    }
    const card = (await this.openmaintService.getEmployeeCard(
      employeeId,
      sessionToken,
    )) as { data?: { _type?: string } } | null;
    const type = card?.data?._type;
    if (type && type !== 'InternalEmployee') {
      throw new ForbiddenException(
        'La ficha de empleado de tu usuario no es InternalEmployee',
      );
    }

    const updated = (await this.gateway.updateSupervision(id, {
      Supervisor: employeeId,
    })) ?? { ...supervision, Supervisor: employeeId };
    return this.buildDetail({ ...supervision, ...updated }, viewer);
  }

  async addFinding(id: number, dto: CreateFindingDto, sessionToken: string) {
    await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [SUPERVISION_PHASES.DRAFT]);
    const { subcategory, observation } = await this.validateFinding(
      supervision,
      dto.index,
      dto.subcategoryId,
      dto.observation,
    );

    const resolvedBySupervisor = dto.resolvedBySupervisor ?? false;
    const finding = await this.gateway.createFinding({
      Supervision: id,
      Index: dto.index,
      Subcategory: subcategory.id,
      Observation: observation,
      SolvedBySuperv: resolvedBySupervisor,
    });
    return {
      success: true,
      data: {
        id: finding._id,
        index: dto.index,
        subcategory,
        observation,
        resolvedBySupervisor,
        photos: [],
      },
    };
  }

  async updateFinding(
    id: number,
    findingId: number,
    dto: UpdateFindingDto,
    sessionToken: string,
  ) {
    await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [SUPERVISION_PHASES.DRAFT]);
    const current = await this.requireFinding(id, findingId);

    const index = dto.index ?? (current.Index as number);
    const subcategoryId = dto.subcategoryId ?? (current.Subcategory as number);
    const observationInput =
      dto.observation !== undefined
        ? dto.observation
        : (current.Observation ?? undefined);
    const { subcategory, observation } = await this.validateFinding(
      supervision,
      index,
      subcategoryId,
      observationInput,
    );

    const resolvedBySupervisor =
      dto.resolvedBySupervisor ?? current.SolvedBySuperv === true;
    await this.gateway.updateFinding(findingId, {
      Index: index,
      Subcategory: subcategory.id,
      Observation: observation,
      // Solo se reescribe la marca si llega: así no se toca al editar el texto.
      ...(dto.resolvedBySupervisor !== undefined
        ? { SolvedBySuperv: dto.resolvedBySupervisor }
        : {}),
    });
    return {
      success: true,
      data: {
        id: findingId,
        index,
        subcategory,
        observation,
        resolvedBySupervisor,
      },
    };
  }

  async deleteFinding(id: number, findingId: number, sessionToken: string) {
    await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [SUPERVISION_PHASES.DRAFT]);
    await this.requireFinding(id, findingId);
    await this.gateway.deleteFinding(findingId);
    return { success: true, data: { id: findingId, deleted: true } };
  }

  async uploadPhoto(
    id: number,
    findingId: number,
    file: UploadedFile,
    sessionToken: string,
  ) {
    await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [SUPERVISION_PHASES.DRAFT]);
    await this.requireFinding(id, findingId);
    assertValidPhoto(file);

    // Las del arreglo (`arr_`) son del operario y llevan su propio tope.
    const existing = (
      await this.gateway.listFindingAttachments(findingId)
    ).filter((a) => !isFixPhoto(a));
    if (existing.length >= MAX_FINDING_PHOTOS) {
      throw new BadRequestException(
        `Máximo ${MAX_FINDING_PHOTOS} fotos por novedad`,
      );
    }

    return this.upload(id, findingId, file, FINDING_PHOTO_PREFIX);
  }

  async deletePhoto(
    id: number,
    findingId: number,
    attachmentId: string,
    sessionToken: string,
  ) {
    await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [SUPERVISION_PHASES.DRAFT]);
    await this.requireFinding(id, findingId);
    const attachment = await this.requireAttachment(findingId, attachmentId);
    if (isFixPhoto(attachment)) {
      throw new ForbiddenException(
        'Las fotos del arreglo las borra el operario que corrige',
      );
    }
    await this.gateway.deleteFindingAttachment(findingId, attachmentId);
    return { success: true, data: { id: attachmentId, deleted: true } };
  }

  /**
   * Foto del arreglo: solo el Corrector, mientras la supervisión está en
   * corrección. Es opcional: «Resuelto» no la exige.
   */
  async uploadFixPhoto(
    id: number,
    findingId: number,
    file: UploadedFile,
    sessionToken: string,
  ) {
    await this.requireCorrector(id, sessionToken);
    const finding = await this.requireFinding(id, findingId);
    if (finding.SolvedBySuperv === true) {
      throw new BadRequestException(
        'El supervisor resolvió esta novedad: no hay nada que corregir',
      );
    }
    assertValidPhoto(file);

    const existing = (
      await this.gateway.listFindingAttachments(findingId)
    ).filter(isFixPhoto);
    if (existing.length >= MAX_FIX_PHOTOS) {
      throw new BadRequestException(
        `Máximo ${MAX_FIX_PHOTOS} fotos del arreglo por novedad`,
      );
    }

    return this.upload(id, findingId, file, FIX_PHOTO_PREFIX);
  }

  async deleteFixPhoto(
    id: number,
    findingId: number,
    attachmentId: string,
    sessionToken: string,
  ) {
    await this.requireCorrector(id, sessionToken);
    await this.requireFinding(id, findingId);
    const attachment = await this.requireAttachment(findingId, attachmentId);
    if (!isFixPhoto(attachment)) {
      throw new ForbiddenException(
        'Solo puedes borrar las fotos del arreglo, no las del supervisor',
      );
    }
    await this.gateway.deleteFindingAttachment(findingId, attachmentId);
    return { success: true, data: { id: attachmentId, deleted: true } };
  }

  /** Asigna o reasigna el conjunto de novedades a un operario del equipo de limpieza. */
  async assign(id: number, dto: AssignCorrectorDto, sessionToken: string) {
    const viewer = await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [
      SUPERVISION_PHASES.DRAFT,
      SUPERVISION_PHASES.IN_CORRECTION,
      SUPERVISION_PHASES.FIXED,
    ]);

    const findings = await this.gateway.listFindings(id);
    const pending = this.pendingOf(findings);
    if (pending.length === 0) {
      throw new BadRequestException(
        findings.length === 0
          ? 'No hay novedades que corregir: aprueba la unidad en su lugar'
          : 'Todas las novedades están resueltas por el supervisor: aprueba la unidad',
      );
    }

    const team = await this.tasksGateway.listEmployees(this.cleaningTeamId());
    const employee = (team.data ?? []).find((e) => e._id === dto.employeeId);
    if (!employee) {
      throw new BadRequestException(
        'El operario elegido no pertenece al equipo de limpieza',
      );
    }

    const inCorrection = await this.gateway.phaseId(
      SUPERVISION_PHASES.IN_CORRECTION,
    );
    const updated = await this.gateway.updateSupervision(id, {
      Employee: dto.employeeId,
      Phase: inCorrection,
    });

    void this.notifyAssigned(supervision, dto.employeeId, pending.length);

    return this.buildDetail(
      {
        ...supervision,
        ...updated,
        Employee: dto.employeeId,
        _Employee_description:
          updated?._Employee_description ?? employee.Description ?? null,
        _Phase_code: SUPERVISION_PHASES.IN_CORRECTION,
      },
      viewer,
    );
  }

  /** «Resuelto»: solo el Corrector asignado y con la supervisión en InCorrection. */
  async markFixed(id: number, sessionToken: string) {
    const supervision = await this.requireCorrector(id, sessionToken);

    await this.setPhase(id, SUPERVISION_PHASES.FIXED);
    void this.notifyFixed(supervision);

    return {
      success: true,
      data: { id, phase: SUPERVISION_PHASES.FIXED },
    };
  }

  async confirm(id: number, sessionToken: string) {
    const viewer = await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertPhase(supervision, [
      SUPERVISION_PHASES.IN_CORRECTION,
      SUPERVISION_PHASES.FIXED,
    ]);
    await this.setPhase(id, SUPERVISION_PHASES.CONFIRMED);
    return this.buildDetail(
      { ...supervision, _Phase_code: SUPERVISION_PHASES.CONFIRMED },
      viewer,
    );
  }

  /**
   * Aprueba la unidad: primero la limpieza a `Reviewed`, después la
   * supervisión a `Approved`. Si la segunda escritura falla, repetir la
   * aprobación la completa sin volver a tocar la limpieza.
   */
  async approve(id: number, sessionToken: string) {
    const viewer = await this.requirePanel(sessionToken);
    const supervision = await this.requireSupervision(id);
    const phase = this.phaseOf(supervision);

    if (phase === SUPERVISION_PHASES.APPROVED) {
      return this.buildDetail(supervision, viewer);
    }
    if (phase === SUPERVISION_PHASES.DRAFT) {
      // Las resueltas por el supervisor no van a corrección: no bloquean.
      const pending = this.pendingOf(await this.gateway.listFindings(id));
      if (pending.length > 0) {
        throw new BadRequestException(
          'Hay novedades sin resolver: asígnalas y confirma los arreglos antes de aprobar',
        );
      }
    } else if (phase !== SUPERVISION_PHASES.CONFIRMED) {
      throw new BadRequestException(
        `No se puede aprobar una supervisión en fase ${phase ?? 'desconocida'}`,
      );
    }

    const taskId = supervision.CleaningTask;
    if (!taskId) {
      throw new BadRequestException(
        'La supervisión no tiene limpieza asociada',
      );
    }
    const task = (await this.tasksGateway.getTaskByIdWithSession(taskId))?.data;
    if (!task) throw new NotFoundException(`Limpieza ${taskId} no encontrada`);
    const current = taskPhase(task);
    if (current === 'Completed') {
      await this.tasksGateway.updateCleaningTask(taskId, {
        phase: PHASE_IDS.REVIEWED,
      });
    } else if (current !== 'Reviewed') {
      throw new ConflictException(
        `La limpieza está en ${current}: no se puede aprobar su supervisión`,
      );
    }

    await this.setPhase(id, SUPERVISION_PHASES.APPROVED);
    return this.buildDetail(
      { ...supervision, _Phase_code: SUPERVISION_PHASES.APPROVED },
      viewer,
    );
  }

  // ─── Operario ───────────────────────────────────────────────────────────────

  /** Las supervisiones en corrección asignadas al operario conectado. */
  async mine(sessionToken: string) {
    const viewer = await this.resolveViewer(sessionToken);
    if (viewer.kind !== 'operator') {
      return { success: true, data: [], meta: { total: 0 } };
    }
    const supervisions = (
      await this.gateway.findByCorrector(viewer.employeeId)
    ).filter((s) => this.phaseOf(s) === SUPERVISION_PHASES.IN_CORRECTION);
    const data = await Promise.all(
      supervisions.map(async (s) => {
        // La limpieza y la ubicación solo rotulan la tarjeta: si fallan, sin ellas.
        const [findings, task, location] = await Promise.all([
          this.gateway.listFindings(s._id),
          s.CleaningTask
            ? this.tasksGateway
                .getTaskByIdWithSession(s.CleaningTask)
                .then((r) => r?.data ?? null)
                .catch(() => null)
            : Promise.resolve(null),
          this.unitLocation(s).catch(() => ({
            unitName: null,
            buildingName: null,
          })),
        ]);
        return {
          id: s._id,
          taskId: s.CleaningTask ?? null,
          taskNumber: task?.TaskNumber ?? null,
          actualEndTime: task?.ActualEndTime ?? null,
          unit: s.Unit
            ? {
                id: s.Unit,
                description: s._Unit_description ?? location.unitName,
              }
            : null,
          buildingName: location.buildingName,
          supervisor: s._Supervisor_description ?? null,
          phase: this.phaseOf(s),
          findingsCount: this.pendingOf(findings).length,
        };
      }),
    );
    return { success: true, data, meta: { total: data.length } };
  }

  /** Proxy de una foto, comprobando que pertenece a una novedad de esa supervisión. */
  async downloadPhoto(
    id: number,
    findingId: number,
    attachmentId: string,
    sessionToken: string,
  ) {
    const viewer = await this.resolveViewer(sessionToken);
    const supervision = await this.requireSupervision(id);
    this.assertCanRead(supervision, viewer);
    await this.requireFinding(id, findingId);
    await this.requireAttachment(findingId, attachmentId);
    return this.gateway.downloadFindingAttachment(findingId, attachmentId);
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  private async createDraft(
    task: CleaningTaskCard,
    actualEndTime: string,
  ): Promise<SupervisionCard> {
    const [draftId, template] = await Promise.all([
      this.gateway.phaseId(SUPERVISION_PHASES.DRAFT),
      this.gateway.findTemplateCard(),
    ]);
    if (!template) {
      this.logger.warn(
        `Supervisión de la limpieza ${task._id} sin Checklist: no existe la tarjeta Code=SUPERVISION`,
      );
    }

    // Supervisor y Corrector quedan vacíos: se llenan al iniciar y al asignar.
    const body: Record<string, unknown> = {
      CleaningTask: task._id,
      Phase: draftId,
    };
    if (task.Unit) body.Unit = task.Unit;
    if (template) body.Checklist = template._id;

    const created = await this.gateway.createSupervision(body);
    this.logger.log(
      `Supervisión ${created._id} creada en Draft para la limpieza ${task._id}`,
    );

    const unitId = task.Unit;
    if (unitId) {
      await this.cancelSupersededDrafts(unitId, task._id, actualEndTime).catch(
        (error) =>
          this.logger.warn(
            `No se pudieron anular los borradores anteriores de la unidad ${unitId}: ${describeError(error)}`,
          ),
      );
    }
    return created;
  }

  /**
   * Anula los borradores de la unidad cuya limpieza terminó antes que la
   * nueva: su inspección ya no refleja el estado de la unidad. No toca las
   * supervisiones que ya avanzaron (InCorrection en adelante).
   */
  private async cancelSupersededDrafts(
    unitId: number,
    currentTaskId: number,
    actualEndTime: string,
  ): Promise<void> {
    const newEnd = timeOf(actualEndTime);
    const drafts = (await this.gateway.findByUnit(unitId)).filter(
      (s) =>
        this.phaseOf(s) === SUPERVISION_PHASES.DRAFT &&
        s.CleaningTask !== currentTaskId,
    );
    if (drafts.length === 0) return;

    const cancelledId = await this.gateway.phaseId(
      SUPERVISION_PHASES.CANCELLED,
    );
    for (const draft of drafts) {
      const previousTask = draft.CleaningTask
        ? (await this.tasksGateway.getTaskByIdWithSession(draft.CleaningTask))
            ?.data
        : null;
      const previousEnd = timeOf(previousTask?.ActualEndTime);
      const isOlder =
        newEnd === null || previousEnd === null || previousEnd < newEnd;
      if (!isOlder) continue;

      await this.gateway.updateSupervision(draft._id, { Phase: cancelledId });
      this.logger.log(
        `Supervisión ${draft._id} anulada: la unidad ${unitId} tiene una limpieza más reciente (${currentTaskId})`,
      );
    }
  }

  /** Hay otra limpieza Completed o Reviewed de la misma unidad que terminó después. */
  private async isSuperseded(
    task: CleaningTaskCard,
    end: number,
  ): Promise<boolean> {
    if (!task.Unit) return false;
    const tasks = await this.gateway.findTasksByUnit(task.Unit);
    return tasks.some((other) => {
      if (other._id === task._id) return false;
      if (!['Completed', 'Reviewed'].includes(taskPhase(other))) return false;
      const otherEnd = timeOf(other.ActualEndTime);
      return otherEnd !== null && otherEnd > end;
    });
  }

  private unavailable(reason: SupervisionUnavailableReason): never {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      reason,
      message: unavailableMessages[reason],
    });
  }

  private async buildDetail(supervision: SupervisionCard, viewer: Viewer) {
    const id = supervision._id;
    const phase = this.phaseOf(supervision);
    const checklistId = supervision.Checklist;
    const [findings, points, lim, task] = await Promise.all([
      this.gateway.listFindings(id),
      checklistId
        ? this.templatePoints(checklistId).catch((error) => {
            this.logger.warn(
              `No se pudo leer el checklist ${checklistId} de la supervisión ${id}: ${describeError(error)}`,
            );
            return [] as SupervisionPoint[];
          })
        : Promise.resolve([] as SupervisionPoint[]),
      this.limSubcategories().catch(() => [] as MaintSubcategory[]),
      supervision.CleaningTask
        ? this.tasksGateway
            .getTaskByIdWithSession(supervision.CleaningTask)
            .then((r) => r?.data ?? null)
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const isPanel = viewer.kind === 'panel';
    const isOwner =
      viewer.kind === 'operator' && supervision.Employee === viewer.employeeId;

    // El operario corrige solo las que el supervisor no resolvió.
    const visible =
      viewer.kind === 'operator' ? this.pendingOf(findings) : findings;
    const pendingCount = this.pendingOf(findings).length;

    const findingsWithPhotos = await Promise.all(
      visible
        .sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0) || a._id - b._id)
        .map(async (finding) => {
          const attachments = await this.gateway
            .listFindingAttachments(finding._id)
            .catch(() => [] as AttachmentCard[]);
          return this.toFinding(id, finding, points, lim, attachments);
        }),
    );

    return {
      success: true,
      data: {
        id,
        phase,
        phaseLabel: supervision._Phase_description ?? null,
        task: task
          ? {
              id: task._id,
              taskNumber: task.TaskNumber ?? null,
              description: task.Description ?? null,
              phase: taskPhase(task),
              // Lo que enseñaba la ficha de la limpieza: tiempos y checkout.
              plannedStartTime: task.PlannedStartTime ?? null,
              actualStartTime: task.ActualStartTime ?? null,
              actualEndTime: task.ActualEndTime ?? null,
              executionTime: task.ExecutionTime ?? null,
              checkoutDate: task.CheckoutDate ?? null,
              // Las de la coordinación y las del equipo (sin el borrador).
              observations: task.Observations ?? null,
              teamObservations: stripDraftObservations(task.TeamObservations),
              employee: task.Employee
                ? { id: task.Employee, name: task._Employee_description ?? '' }
                : null,
            }
          : supervision.CleaningTask
            ? { id: supervision.CleaningTask }
            : null,
        unit: supervision.Unit
          ? {
              id: supervision.Unit,
              description: supervision._Unit_description ?? null,
            }
          : null,
        corrector: supervision.Employee
          ? {
              id: supervision.Employee,
              name: supervision._Employee_description ?? '',
            }
          : null,
        supervisor: supervision.Supervisor
          ? {
              id: supervision.Supervisor,
              name: supervision._Supervisor_description ?? '',
            }
          : null,
        checklist: {
          id: supervision.Checklist ?? null,
          totalPoints: points.length,
          areas: groupPointsByArea(points),
        },
        findings: findingsWithPhotos,
        can: {
          start: isPanel && phase === SUPERVISION_PHASES.DRAFT,
          editFindings: isPanel && phase === SUPERVISION_PHASES.DRAFT,
          assign:
            isPanel &&
            pendingCount > 0 &&
            [
              SUPERVISION_PHASES.DRAFT,
              SUPERVISION_PHASES.IN_CORRECTION,
              SUPERVISION_PHASES.FIXED,
            ].includes(phase as never),
          confirm:
            isPanel &&
            (phase === SUPERVISION_PHASES.IN_CORRECTION ||
              phase === SUPERVISION_PHASES.FIXED),
          approve:
            isPanel &&
            (phase === SUPERVISION_PHASES.CONFIRMED ||
              (phase === SUPERVISION_PHASES.DRAFT && pendingCount === 0)),
          markFixed: isOwner && phase === SUPERVISION_PHASES.IN_CORRECTION,
        },
      },
    };
  }

  /** Novedades que van a corrección: las que el supervisor no resolvió. */
  private pendingOf(findings: FindingCard[]): FindingCard[] {
    return findings.filter((f) => f.SolvedBySuperv !== true);
  }

  private toFinding(
    supervisionId: number,
    finding: FindingCard,
    points: SupervisionPoint[],
    lim: MaintSubcategory[],
    attachments: AttachmentCard[],
  ) {
    const point = points.find((p) => p.index === finding.Index) ?? null;
    const known = lim.find((s) => s.id === finding.Subcategory);
    return {
      id: finding._id,
      index: finding.Index ?? null,
      point: point
        ? { area: point.area, name: point.name, criterion: point.criterion }
        : null,
      subcategory: finding.Subcategory
        ? {
            id: finding.Subcategory,
            name: known?.name ?? finding._Subcategory_description ?? '',
            isOther: known?.isOther ?? false,
          }
        : null,
      observation: finding.Observation ?? null,
      resolvedBySupervisor: finding.SolvedBySuperv === true,
      // Antes (las del supervisor) y después (las del operario que corrigió).
      photos: attachments
        .filter((a) => !isFixPhoto(a))
        .map((a) => this.toPhoto(supervisionId, finding._id, a)),
      fixPhotos: attachments
        .filter(isFixPhoto)
        .map((a) => this.toPhoto(supervisionId, finding._id, a)),
    };
  }

  /** Sube el adjunto con el prefijo de su origen y devuelve la foto ya con su URL. */
  private async upload(
    supervisionId: number,
    findingId: number,
    file: UploadedFile,
    prefix: string,
  ) {
    const fileName = buildUniqueFileName(file, prefix);
    const uploaded = await this.gateway.uploadFindingAttachment(
      findingId,
      file,
      fileName,
    );
    if (!uploaded?._id) {
      // Sin id no hay forma de mostrarla ni borrarla: no se informa éxito.
      throw new BadRequestException(
        'openMAINT no confirmó la foto; vuelve a intentarlo',
      );
    }
    return {
      success: true,
      data: this.toPhoto(supervisionId, findingId, uploaded, fileName),
    };
  }

  private toPhoto(
    supervisionId: number,
    findingId: number,
    attachment: AttachmentCard,
    fallbackName?: string,
  ) {
    return {
      id: attachment._id,
      fileName: attachment.name ?? attachment.fileName ?? fallbackName ?? null,
      uploadDate: attachment.created ?? attachment.modified ?? null,
      downloadUrl: `/cleaning-supervisions/${supervisionId}/findings/${findingId}/attachments/${encodeURIComponent(attachment._id)}/download`,
    };
  }

  private toSummary(supervision: SupervisionCard): SupervisionSummary {
    return {
      id: supervision._id,
      phase: this.phaseOf(supervision),
      phaseLabel: supervision._Phase_description ?? null,
      corrector: supervision.Employee
        ? {
            id: supervision.Employee,
            name: supervision._Employee_description ?? '',
          }
        : null,
    };
  }

  /** openMAINT trae el código de la fase en `_Phase_code`. */
  private phaseOf(supervision: SupervisionCard): SupervisionPhase | null {
    return (supervision._Phase_code as SupervisionPhase) ?? null;
  }

  private assertPhase(
    supervision: SupervisionCard,
    allowed: SupervisionPhase[],
  ): void {
    const phase = this.phaseOf(supervision);
    if (!phase || !allowed.includes(phase)) {
      throw new BadRequestException(
        `La supervisión está en fase ${phase ?? 'desconocida'}; esta acción requiere ${allowed.join(' o ')}`,
      );
    }
  }

  private async setPhase(id: number, phase: SupervisionPhase): Promise<void> {
    await this.gateway.updateSupervision(id, {
      Phase: await this.gateway.phaseId(phase),
    });
  }

  private async requireSupervision(id: number): Promise<SupervisionCard> {
    const supervision = await this.gateway.getSupervision(id);
    if (!supervision) {
      throw new NotFoundException(`Supervisión ${id} no encontrada`);
    }
    return supervision;
  }

  private async requireFinding(
    supervisionId: number,
    findingId: number,
  ): Promise<FindingCard> {
    const finding = (await this.gateway.listFindings(supervisionId)).find(
      (f) => f._id === findingId,
    );
    if (!finding) {
      throw new NotFoundException(
        `La novedad ${findingId} no pertenece a la supervisión ${supervisionId}`,
      );
    }
    return finding;
  }

  private async requireAttachment(
    findingId: number,
    attachmentId: string,
  ): Promise<AttachmentCard> {
    const attachment = (
      await this.gateway.listFindingAttachments(findingId)
    ).find((a) => a._id === attachmentId);
    if (!attachment) {
      throw new NotFoundException(
        `La foto ${attachmentId} no pertenece a la novedad ${findingId}`,
      );
    }
    return attachment;
  }

  /** Coordinación y panel leen cualquiera; el operario solo la suya en InCorrection. */
  private assertCanRead(supervision: SupervisionCard, viewer: Viewer): void {
    if (viewer.kind === 'panel' || viewer.kind === 'coordinator') return;
    if (
      supervision.Employee === viewer.employeeId &&
      this.phaseOf(supervision) === SUPERVISION_PHASES.IN_CORRECTION
    ) {
      return;
    }
    throw new ForbiddenException('No tienes acceso a esta supervisión');
  }

  private async validateFinding(
    supervision: SupervisionCard,
    index: number,
    subcategoryId: number,
    observationInput: string | null | undefined,
  ): Promise<{ subcategory: MaintSubcategory; observation: string | null }> {
    if (!supervision.Checklist) {
      throw new BadRequestException(
        'La supervisión no tiene checklist relacionado',
      );
    }
    const points = await this.templatePoints(supervision.Checklist);
    if (!Number.isInteger(index) || index < 1 || index > points.length) {
      throw new BadRequestException(
        `El punto ${index} no existe en el checklist (1 a ${points.length})`,
      );
    }

    const subcategory = (await this.limSubcategories()).find(
      (s) => s.id === subcategoryId,
    );
    if (!subcategory) {
      throw new BadRequestException(
        'La novedad debe ser una subcategoría de Limpieza (LIM)',
      );
    }

    const observation = observationInput?.trim() || null;
    if (subcategory.isOther && !observation) {
      throw new BadRequestException(
        'Escribe la observación cuando la novedad es «Otro»',
      );
    }
    return { subcategory, observation };
  }

  /** Subcategorías de LIM. La API no aplica el filtro CQL de la UI, así que se valida aquí. */
  private async limSubcategories(): Promise<MaintSubcategory[]> {
    const categories = await this.categories.list();
    return (
      categories.find((c) => c.code === CLEANING_CATEGORY_CODE)
        ?.subcategories ?? []
    );
  }

  /** Puntos del checklist de una tarjeta de `CleaningActivity`: el CSV de `Plantilla` o, si no hay, `Detalle`. */
  private async templatePoints(
    activityId: number,
  ): Promise<SupervisionPoint[]> {
    const cached = this.templateCache.get(activityId);
    if (cached && cached.expiresAt > Date.now()) return cached.points;

    const activity = (await this.tasksGateway.getCleaningActivity(activityId))
      ?.data;
    if (!activity) {
      throw new NotFoundException(`Checklist ${activityId} no encontrado`);
    }

    let rows: string[] = [];
    const attachmentId = activity.Plantilla?.trim();
    if (attachmentId) {
      const file = await this.tasksGateway.downloadActivityTemplate(
        activityId,
        attachmentId,
      );
      const parsed = readCsvTemplate(file.data);
      if (parsed.ok) rows = parsed.rows;
      else
        this.logger.warn(
          `Checklist de supervisión ${activityId}: ${parsed.reason}. Se usa Detalle.`,
        );
    }
    if (rows.length === 0 && activity.Detalle) {
      rows = activity.Detalle.split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    }

    const result = parseSupervisionChecklist(rows);
    if (!result.ok) {
      throw new BadRequestException(
        `El checklist de supervisión no se puede leer: ${result.reason}`,
      );
    }
    this.templateCache.set(activityId, {
      points: result.points,
      expiresAt: Date.now() + TEMPLATE_CACHE_MS,
    });
    return result.points;
  }

  /** Olvida el checklist cacheado; lo llama quien guarda la plantilla. */
  invalidateTemplate(activityId: number): void {
    this.templateCache.delete(activityId);
  }

  private async requirePanel(
    sessionToken: string,
  ): Promise<Extract<Viewer, { kind: 'panel' }>> {
    const { role } =
      await this.sessionRoleService.resolveIdentity(sessionToken);
    if (!isSupervisionPanelRole(role)) {
      throw new ForbiddenException(
        'Solo SupervisorLimpieza puede usar el panel de supervisión',
      );
    }
    return { kind: 'panel', role: role as string };
  }

  /**
   * El Corrector asignado, con la supervisión en corrección: el único que
   * marca «Resuelto» y sube o borra fotos del arreglo.
   */
  private async requireCorrector(
    id: number,
    sessionToken: string,
  ): Promise<SupervisionCard> {
    const viewer = await this.resolveViewer(sessionToken);
    if (viewer.kind !== 'operator') {
      throw new ForbiddenException(
        'Solo el operario asignado puede corregir esta supervisión',
      );
    }
    const supervision = await this.requireSupervision(id);
    if (supervision.Employee !== viewer.employeeId) {
      throw new ForbiddenException(
        'Estas correcciones no están asignadas a ti',
      );
    }
    this.assertPhase(supervision, [SUPERVISION_PHASES.IN_CORRECTION]);
    return supervision;
  }

  /**
   * Panel y coordinación por rol; el operario por su ficha (`PortalUsername`).
   * Nunca se usa la cabecera `x-cleaning-employee-id`.
   */
  private async resolveViewer(sessionToken: string): Promise<Viewer> {
    const { role, username } =
      await this.sessionRoleService.resolveIdentity(sessionToken);
    if (isSupervisionPanelRole(role)) {
      return { kind: 'panel', role: role as string };
    }
    if (isCoordinatorRole(role ?? undefined)) {
      return { kind: 'coordinator', role: role as string };
    }
    const employeeId = username
      ? await this.openmaintService.resolveCleaningEmployeeId(
          username,
          sessionToken,
        )
      : null;
    if (!employeeId) {
      throw new ForbiddenException('No tienes acceso a las supervisiones');
    }
    return { kind: 'operator', employeeId };
  }

  /** `_id` del equipo de operarios de limpieza; sin la variable no se filtra por equipo. */
  private cleaningTeamId(): number | undefined {
    const value = Number(
      this.configService.get<string>('OPENMAINT_CLEANING_TEAM_ID'),
    );
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private async unitLocation(supervision: SupervisionCard) {
    if (!supervision.Unit) return { unitName: null, buildingName: null };
    const unit = await this.tasksGateway
      .getUnitById(supervision.Unit, '')
      .then((r) => r?.data ?? null)
      .catch(() => null);
    return {
      unitName: supervision._Unit_description ?? unit?.Description ?? null,
      buildingName: unit?._Building_description ?? null,
    };
  }

  /** Best-effort: nunca propaga. */
  private async notifyAssigned(
    supervision: SupervisionCard,
    employeeId: number,
    findingsCount: number,
  ) {
    try {
      await this.pushDispatch.notifyCleaningCorrectionsAssigned({
        id: supervision.CleaningTask ?? supervision._id,
        supervisionId: supervision._id,
        cleaningEmployeeId: employeeId,
        findingsCount,
        ...(await this.unitLocation(supervision)),
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar la asignación de la supervisión ${supervision._id}: ${describeError(error)}`,
      );
    }
  }

  /** Best-effort: nunca propaga. */
  private async notifyFixed(supervision: SupervisionCard) {
    try {
      await this.pushDispatch.notifyCleaningCorrectionsFixed({
        id: supervision.CleaningTask ?? supervision._id,
        supervisionId: supervision._id,
        employeeName: supervision._Employee_description,
        ...(await this.unitLocation(supervision)),
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar «Resuelto» de la supervisión ${supervision._id}: ${describeError(error)}`,
      );
    }
  }
}
