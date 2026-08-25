import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { PushDispatchService } from '../push-notifications/push-dispatch.service';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';
import {
  PHASE_DESC_TO_ID,
  PHASE_IDS,
  PHASE_NAMES,
  PHASE_TRANSITIONS,
  PhaseId,
} from './constants/phase.constants';
import { SUPERVISOR_ROLES } from './constants/roles.constants';
import { CancelTaskDto } from './dto/cancel-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateCleaningTaskDto } from './dto/create-cleaning-task.dto';
import { GetCheckoutsQueryDto } from './dto/get-checkouts-query.dto';
import { PauseTaskDto } from './dto/pause-task.dto';
import { ReopenTaskDto } from './dto/reopen-task.dto';
import { ReviewTaskDto } from './dto/review-task.dto';
import { UpdateCleaningTaskDto } from './dto/update-cleaning-task.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

/** Tipo mínimo del archivo subido por multer (evita dependencia de @types/multer) */
type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const PHASE_LOOKUP = { Assigned: 'Assigned' };
const SOURCE_LOOKUP = { Hostaway: 'Hostaway', Manual: 'Manual' };
export {
  SUPERVISOR_ROLES,
  isSupervisorRole,
} from './constants/roles.constants';

/**
 * Prefijos de las marcas que se escriben en TeamObservations. La marca completa
 * lleva dentro la fecha y hora del evento:
 *
 *   [Pausado: 2026-08-19 | 10:20]: se acabó el detergente
 *   [Reanudado: 2026-08-19 | 10:34]
 *
 * Se buscan por prefijo, así que las notas del formato anterior (`[Pausado]:` y
 * `[Reanudado]:`) siguen reconociéndose.
 */
const PAUSE_MARKER = '[Pausado';
const RESUME_MARKER = '[Reanudado';
/**
 * Arranque de una tarea reabierta, que no es lo mismo que reanudar una pausa: el
 * cronómetro vuelve a cero y lo que se trabaje se suma a lo que ya había. Por eso
 * hace falta distinguirlos en la bitácora y no solo por la fase.
 *
 * La marca lleva además el tiempo que la tarea ya tenía al reabrirse:
 *
 *   [Reiniciado: 2026-08-19 | 10:34 | 25min]
 *
 * OpenMAINT guarda una sola cifra de tiempo, la total. Sin ese número, al
 * reanudar una pausa hecha dentro de una sesión reabierta no habría forma de
 * saber qué parte del acumulado pertenece a esta sesión, y el cronómetro
 * reaparecería con el histórico incluido.
 */
const RESTART_MARKER = '[Reiniciado';

/**
 * Una tarea está en pausa si volvió a Assigned y la última marca escrita en
 * TeamObservations es la de pausa (no la de reanudación).
 *
 * OpenMAINT no tiene una fase "Paused" y no se creó una a propósito, así que el
 * estado vive en la bitácora del empleado. Por eso el backend lo resuelve una sola
 * vez aquí y lo expone como el booleano `isPaused`: ninguna vista debe leer el
 * texto de las observaciones para deducirlo.
 */
export const isPausedTask = (task: any): boolean => {
  const phaseDesc = task?._phase_description ?? String(task?.phase ?? '');
  if (phaseDesc !== PHASE_NAMES[PHASE_IDS.ASSIGNED]) return false;

  const notes = String(task?.TeamObservations ?? '');
  const lastPause = notes.lastIndexOf(PAUSE_MARKER);
  return lastPause !== -1 && lastPause > notes.lastIndexOf(RESUME_MARKER);
};

/**
 * Bloque de borrador al final de TeamObservations: `{lo que el empleado llevaba
 * escrito}`. Va anclado al final justo para que el recorte de longitud se coma la
 * bitácora vieja antes que el texto vivo, y para no confundirlo con unas llaves
 * escritas en medio de una observación.
 */
const DRAFT_BLOCK = /\s*\{([\s\S]*)\}\s*$/;

/** Tope de TeamObservations, bitácora y borrador incluidos. */
const MAX_TEAM_OBSERVATIONS = 500;

/**
 * Lo que el empleado llevaba escrito en el campo "Observaciones" cuando pausó.
 *
 * Es un borrador, no una observación: se guarda en OpenMAINT para que sobreviva a
 * la pausa (y a que cierre la app), pero nunca se muestra. Por eso viaja aparte y
 * `teamObservations` sale siempre limpio de este bloque.
 */
export const extractDraftObservations = (
  text: string | null | undefined,
): string | null => {
  const draft = DRAFT_BLOCK.exec(text ?? '')?.[1]?.trim();
  return draft ? draft : null;
};

/** El texto visible: la bitácora sin el borrador. */
export const stripDraftObservations = (
  text: string | null | undefined,
): string | null => {
  const stripped = (text ?? '').replace(DRAFT_BLOCK, '').trim();
  return stripped ? stripped : null;
};

/**
 * Instante en que arrancó la ejecución que está corriendo AHORA, o null si la
 * tarea no está en ejecución.
 *
 * Es el cero del cronómetro, y vive en OpenMAINT para que no dependa del
 * navegador: dos ventanas, otro dispositivo o una recarga calculan todas el mismo
 * tiempo transcurrido. Antes esta marca solo existía en el localStorage del
 * equipo, así que cada carga de página la reinventaba y el conteo volvía a cero.
 *
 * De dónde sale, en orden:
 * 1. La última nota de reanudación que escribe startTask a partir del segundo
 *    arranque (reanudar una pausa o reabrir). Se lee tanto el formato actual,
 *    `[Reanudado: 2026-08-19 | 10:34]`, como el anterior, `[Reanudado]: <ISO>`.
 * 2. ActualStartTime, válido solo mientras la tarea no acumule tiempo: es su
 *    primera y única ejecución.
 * Si no hay ninguno (tarea que ya venía corriendo desde antes de esta versión),
 * devuelve null y el front cae a su marca local.
 *
 * La hora legible va sin segundos, así que el cero queda redondeado al minuto:
 * el tiempo contado puede quedar hasta 59 s por encima del real, nunca por debajo.
 */
export const resolveSessionStartedAt = (task: any): string | null => {
  const phaseDesc = task?._phase_description ?? String(task?.phase ?? '');
  if (phaseDesc !== PHASE_NAMES[PHASE_IDS.IN_EXECUTION]) return null;

  const notes = String(task?.TeamObservations ?? '');
  // Gana la marca que aparezca más tarde en el texto, sin importar su formato.
  let lastIndex = -1;
  let lastResume: Date | null = null;

  const remember = (index: number, date: Date) => {
    if (index >= lastIndex && !isNaN(date.getTime())) {
      lastIndex = index;
      lastResume = date;
    }
  };

  // El corchete puede traer cosas después de la hora (la marca de reinicio lleva
  // el tiempo histórico), así que se admite lo que venga hasta el cierre.
  for (const match of notes.matchAll(
    /\[(?:Reanudado|Reiniciado):\s*(\d{4})-(\d{2})-(\d{2})\s*\|\s*(\d{1,2}):(\d{2})[^\]]*\]/g,
  )) {
    // Los componentes se interpretan en la zona horaria del servidor, que es la
    // misma con la que se escribieron.
    remember(
      match.index ?? 0,
      new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
      ),
    );
  }

  for (const match of notes.matchAll(/\[Reanudado\]:\s*(\S+)/g)) {
    remember(match.index ?? 0, new Date(match[1]));
  }

  if (lastResume) return (lastResume as Date).toISOString();

  const accumulated = Number(task?.ExecutionTime);
  const hasAccumulated = !isNaN(accumulated) && accumulated > 0;
  return hasAccumulated ? null : (task?.ActualStartTime ?? null);
};

/**
 * Minutos con los que ARRANCA el cronómetro de la ejecución en curso.
 *
 * Distingue los dos arranques que no son el primero, y por eso se decide en el
 * servidor y no en el navegador:
 * - Reanudar una pausa continúa el conteo: parte del tiempo ya guardado.
 * - Reabrir una tarea empieza de cero, y lo que se trabaje se suma al acumulado.
 *
 * Ojo: esto es solo lo que se muestra. El total que se registra en ExecutionTime
 * siempre es `acumulado + lo de esta sesión`, así que en una tarea reabierta el
 * cronómetro marca menos que el tiempo total de la tarea, a propósito.
 */
export const resolveSessionBaseMinutes = (task: any): number => {
  const phaseDesc = task?._phase_description ?? String(task?.phase ?? '');
  if (phaseDesc !== PHASE_NAMES[PHASE_IDS.IN_EXECUTION]) return 0;

  const notes = String(task?.TeamObservations ?? '');
  const lastResume = notes.lastIndexOf(RESUME_MARKER);
  if (lastResume === -1) return 0;
  if (notes.lastIndexOf(RESTART_MARKER) > lastResume) return 0;

  const accumulated = Number(task?.ExecutionTime);
  if (isNaN(accumulated) || accumulated <= 0) return 0;

  // Se reanuda una pausa: el reloj sigue desde lo trabajado en ESTA sesión, o sea
  // el acumulado menos lo que la tarea ya arrastraba cuando se reabrió.
  return Math.max(0, accumulated - resolveSessionCarryMinutes(task));
};

/**
 * Minutos que la tarea ya tenía cuando se reabrió, leídos de la última marca de
 * reinicio. No pertenecen a la sesión en curso: el cronómetro los ignora, aunque
 * sigan sumando en el total de OpenMAINT.
 *
 * Cero si la tarea nunca se reabrió, o si la marca es de una versión anterior que
 * todavía no anotaba el número.
 */
export const resolveSessionCarryMinutes = (task: any): number => {
  const notes = String(task?.TeamObservations ?? '');
  let carry = 0;

  for (const match of notes.matchAll(
    /\[Reiniciado:[^\]]*\|\s*([\d.]+)\s*min\s*\]/g,
  )) {
    const parsed = Number(match[1]);
    if (!isNaN(parsed) && parsed >= 0) carry = parsed;
  }

  return carry;
};
const ALLOWED_UPLOAD_PHASES = ['InExecution', 'Completed'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
/**
 * Tope defensivo, en minutos, para el tiempo total de ejecución reportado por el
 * front. Es un acumulado entre pausas y reaperturas, así que se deja holgado
 * (7 días) y solo ataja valores absurdos.
 */
const MAX_TOTAL_EXECUTION_MINUTES = 1440 * 7;
/** Ventana máxima consultable de checkouts, para acotar el costo hacia Hostaway. */
const MAX_CHECKOUT_RANGE_DAYS = 92;

@Injectable()
export class CleaningTasksService {
  private readonly logger = new Logger(CleaningTasksService.name);

  constructor(
    private readonly hostawayService: HostawayService,
    private readonly openmaintService: CleaningTasksOpenmaintService,
    private readonly pushDispatch: PushDispatchService,
  ) {}

  /**
   * Lectura de checkouts desde Hostaway, en un día o en un rango.
   *
   * Acepta `date` (un solo día, comportamiento histórico) o el par
   * `dateFrom`/`dateTo`. Si no llega nada, consulta hoy.
   * El campo `date` de la respuesta se conserva para no romper a los
   * clientes que ya lo leen.
   */
  async getCheckouts(query: GetCheckoutsQueryDto = {}) {
    const today = new Date().toISOString().split('T')[0];

    const dateFrom = query.dateFrom ?? query.date ?? today;
    const dateTo = query.dateTo ?? query.date ?? dateFrom;

    if (dateTo < dateFrom) {
      throw new BadRequestException(
        `El rango es inválido: dateTo (${dateTo}) es anterior a dateFrom (${dateFrom})`,
      );
    }

    const spanDays = this.countDaysInclusive(dateFrom, dateTo);
    if (spanDays > MAX_CHECKOUT_RANGE_DAYS) {
      throw new BadRequestException(
        `El rango solicitado (${spanDays} días) supera el máximo de ${MAX_CHECKOUT_RANGE_DAYS} días`,
      );
    }

    const response = await this.hostawayService.getCheckouts(dateFrom, dateTo);

    const checkouts = response.result
      .map((r) => ({
        reservationId: r.reservationId,
        guestName: r.guestName,
        listingName: r.listingName,
        listingId: r.listingId,
        checkoutDate: r.checkoutDate,
        checkoutTime: r.checkoutTime,
      }))
      .sort(
        (a, b) =>
          a.checkoutDate.localeCompare(b.checkoutDate) ||
          a.listingName.localeCompare(b.listingName),
      );

    return {
      date: dateFrom,
      dateFrom,
      dateTo,
      checkouts,
      count: checkouts.length,
    };
  }

  /** Días que abarca [from, to] inclusive, calculado en UTC. */
  private countDaysInclusive(from: string, to: string): number {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);

    if (isNaN(start) || isNaN(end)) {
      throw new BadRequestException(
        'Las fechas deben tener formato YYYY-MM-DD',
      );
    }

    return Math.floor((end - start) / 86_400_000) + 1;
  }

  async getCleaningTasks(date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const response = await this.openmaintService.getCleaningTasks(targetDate);
    return {
      tasks: (response.data ?? []).map((task) => ({
        id: task._id,
        taskNumber: task.TaskNumber,
        phase: task._phase_description ?? task.phase,
        unit: task._Unit_description ?? String(task.Unit ?? ''),
        employee: task._Employee_description ?? String(task.Employee ?? ''),
        plannedStartTime: task.PlannedStartTime ?? null,
        plannedEndTime: task.PlannedEndTime ?? null,
        actualStartTime: task.ActualStartTime ?? null,
        actualEndTime: task.ActualEndTime ?? null,
        executionTime: task.ExecutionTime ?? null,
        delayTime: task.DelayTime ?? null,
        taskObservations: task.Observations ?? null,
        supervisionObserv: task.SupervisionObserv ?? null,
        teamObservations: stripDraftObservations(task.TeamObservations),
        isPaused: isPausedTask(task),
        sessionStartedAt: resolveSessionStartedAt(task),
        sessionBaseMinutes: resolveSessionBaseMinutes(task),
        hostawayReservationId: task.HostawayReservation ?? null,
        checkoutDate: task.CheckoutDate ?? null,
        source: task._Source_description ?? task.Source ?? null,
        generatedDate: task.GeneratedDate,
      })),
    };
  }

  async createCleaningTask(dto: CreateCleaningTaskDto) {
    const exists = await this.openmaintService.taskExistsByReservationId(
      dto.hostawayReservationId,
    );
    if (exists) {
      return {
        created: false,
        message: `Ya existe una tarea para la reserva ${dto.hostawayReservationId}`,
      };
    }
    const today = new Date().toISOString().split('T')[0];
    const body: Record<string, unknown> = {
      TaskNumber: `CT.${new Date().getFullYear()}.${Date.now().toString().slice(-4)}`,
      phase: PHASE_LOOKUP.Assigned,
      GeneratedDate: today,
      CheckoutDate: dto.checkoutDate,
      HostawayReservation: dto.hostawayReservationId,
      Source: SOURCE_LOOKUP.Hostaway,
      Description: `Limpieza - ${dto.listingName}`,
    };
    if (dto.plannedStartTime) body.PlannedStartTime = dto.plannedStartTime;
    if (dto.plannedEndTime) body.PlannedEndTime = dto.plannedEndTime;
    try {
      const response = await this.openmaintService.createCleaningTask(body);
      return {
        created: true,
        taskId: response.data?._id ?? null,
        taskNumber: response.data?.TaskNumber ?? null,
        reservationId: dto.hostawayReservationId,
      };
    } catch {
      throw new InternalServerErrorException(
        `Error al crear tarea para reserva ${dto.hostawayReservationId}`,
      );
    }
  }

  async generateTasksFromCheckouts(checkouts: CreateCleaningTaskDto[]) {
    const results = await Promise.allSettled(
      checkouts.map((c) => this.createCleaningTask(c)),
    );
    return {
      created: results.filter(
        (r) => r.status === 'fulfilled' && r.value.created,
      ).length,
      skipped: results.filter(
        (r) => r.status === 'fulfilled' && !r.value.created,
      ).length,
      failed: results.filter((r) => r.status === 'rejected').length,
      total: checkouts.length,
    };
  }

  // ─── Sincronización desde Hostaway ────────────────────────────────────────

  async syncFromHostaway(dateFrom: string, dateTo: string) {
    const response = await this.hostawayService.getCheckouts(dateFrom, dateTo);
    const checkouts: CreateCleaningTaskDto[] = response.result
      .filter((r) => !!r.reservationId)
      .map((r) => ({
        hostawayReservationId: r.reservationId,
        listingName: r.listingName,
        listingId: r.listingId,
        checkoutDate: r.checkoutDate,
        checkoutTime: this.normalizeCheckoutTime(r.checkoutTime),
        guestName: r.guestName,
      }));
    return {
      dateFrom,
      dateTo,
      ...(await this.generateTasksFromCheckouts(checkouts)),
    };
  }

  /**
   * Hostaway devuelve checkOutTime como entero (11 = 11:00) mientras que el
   * mock y el DTO lo expresan como texto 'HH:MM'. Unificamos a texto.
   */
  private normalizeCheckoutTime(value: string | number): string {
    if (typeof value === 'number') {
      return `${String(value).padStart(2, '0')}:00`;
    }
    return value.includes(':') ? value : `${value.padStart(2, '0')}:00`;
  }

  // ─── Todas las tareas (supervisor) ────────────────────────────────────────

  async getAllTasks(
    sessionToken: string,
    options: {
      limit?: number;
      offset?: number;
      phase?: string;
      date?: string;
      employeeId?: number;
    } = {},
  ) {
    const { limit = 50, offset = 0 } = options;
    const response = await this.openmaintService.getAllTasks(options);
    const rawTasks = response.data ?? [];
    const uniqueUnitIds = [
      ...new Set(
        rawTasks.map((t) => t.Unit).filter((u): u is number => u != null),
      ),
    ];
    const unitResults = await Promise.all(
      uniqueUnitIds.map((id) => this.fetchUnitInfo(id, sessionToken)),
    );
    const unitMap = new Map(uniqueUnitIds.map((id, i) => [id, unitResults[i]]));
    const tasks = rawTasks.map((task) => ({
      id: task._id,
      type: task._type ?? 'CleaningTask',
      taskNumber: task.TaskNumber,
      description: task.Description ?? null,
      phase: task._phase_description ?? task.phase,
      generatedDate: task.GeneratedDate,
      plannedStartTime: task.PlannedStartTime ?? null,
      plannedEndTime: task.PlannedEndTime ?? null,
      actualStartTime: task.ActualStartTime ?? null,
      actualEndTime: task.ActualEndTime ?? null,
      executionTime: task.ExecutionTime ?? null,
      delayTime: task.DelayTime ?? null,
      taskObservations: task.Observations ?? null,
      supervisionObserv: task.SupervisionObserv ?? null,
      teamObservations: stripDraftObservations(task.TeamObservations),
      isPaused: isPausedTask(task),
      sessionStartedAt: resolveSessionStartedAt(task),
      sessionBaseMinutes: resolveSessionBaseMinutes(task),
      hostawayReservation: task.HostawayReservation ?? null,
      checkoutDate: task.CheckoutDate ?? null,
      source: task._Source_description ?? task.Source ?? null,
      unit: task.Unit != null ? (unitMap.get(task.Unit) ?? null) : null,
      employee: task.Employee
        ? { id: task.Employee, name: task._Employee_description ?? '' }
        : null,
    }));
    return {
      success: true,
      data: tasks,
      meta: { total: response.meta?.total ?? tasks.length, limit, offset },
    };
  }

  // ─── Tareas por empleado ──────────────────────────────────────────────────

  async getMyTasks(
    employeeId: number,
    sessionToken: string,
    limit = 50,
    offset = 0,
  ) {
    const response = await this.openmaintService.getTasksByEmployee(
      employeeId,
      sessionToken,
      limit,
      offset,
    );
    const rawTasks = response.data ?? [];
    const uniqueUnitIds = [
      ...new Set(
        rawTasks.map((t) => t.Unit).filter((u): u is number => u != null),
      ),
    ];
    const unitResults = await Promise.all(
      uniqueUnitIds.map((id) => this.fetchUnitInfo(id, sessionToken)),
    );
    const unitMap = new Map(uniqueUnitIds.map((id, i) => [id, unitResults[i]]));
    const tasks = rawTasks.map((task) => ({
      id: task._id,
      type: task._type ?? 'CleaningTask',
      taskNumber: task.TaskNumber,
      description: task.Description ?? null,
      phase: task._phase_description ?? task.phase,
      generatedDate: task.GeneratedDate,
      plannedStartTime: task.PlannedStartTime ?? null,
      plannedEndTime: task.PlannedEndTime ?? null,
      actualStartTime: task.ActualStartTime ?? null,
      actualEndTime: task.ActualEndTime ?? null,
      executionTime: task.ExecutionTime ?? null,
      delayTime: task.DelayTime ?? null,
      taskObservations: task.Observations ?? null,
      supervisionObserv: task.SupervisionObserv ?? null,
      teamObservations: stripDraftObservations(task.TeamObservations),
      isPaused: isPausedTask(task),
      sessionStartedAt: resolveSessionStartedAt(task),
      sessionBaseMinutes: resolveSessionBaseMinutes(task),
      hostawayReservation: task.HostawayReservation ?? null,
      checkoutDate: task.CheckoutDate ?? null,
      source: task._Source_description ?? task.Source ?? null,
      unit: task.Unit != null ? (unitMap.get(task.Unit) ?? null) : null,
      employee: task.Employee
        ? { id: task.Employee, name: task._Employee_description ?? '' }
        : null,
    }));
    return {
      success: true,
      data: tasks,
      meta: { total: response.meta?.total ?? tasks.length, limit, offset },
    };
  }

  // ─── Detalle de tarea ─────────────────────────────────────────────────────

  async getTaskDetail(
    taskId: number,
    employeeId: number,
    sessionToken: string,
  ) {
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    this.validateOwnership(task.Employee, employeeId);
    return this.buildTaskDetail(task, sessionToken);
  }

  async getTaskDetailAsSupervisor(taskId: number, sessionToken: string) {
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    return this.buildTaskDetail(task, sessionToken);
  }

  private async buildTaskDetail(task: any, sessionToken: string) {
    const phaseDesc = task._phase_description ?? String(task.phase);
    const phaseId = PHASE_DESC_TO_ID[phaseDesc] ?? null;
    const [attResponse, checklistDetail, unitInfo] = await Promise.all([
      this.openmaintService
        .getAttachments(task._id, sessionToken)
        .catch(() => null),
      this.fetchChecklistDetail(task.CleaningChecklist),
      task.Unit != null
        ? this.fetchUnitInfo(task.Unit, sessionToken)
        : Promise.resolve(null),
    ]);
    // downloadUrl es imprescindible: sin él la vista de ejecución no tiene de
    // dónde pintar las fotos ya subidas, que era justo lo que fallaba al reanudar
    // o reabrir una tarea.
    const attachments = (attResponse?.data ?? []).map((a) => ({
      id: a._id,
      fileName: a.fileName,
      category: a._category_description ?? a.category,
      uploadDate: a.created ?? a.modified ?? null,
      downloadUrl: `/cleaning-tasks/${task._id}/attachments/${a._id}/download`,
    }));
    return {
      success: true,
      data: {
        id: task._id,
        type: task._type ?? 'CleaningTask',
        taskNumber: task.TaskNumber,
        description: task.Description ?? null,
        phase: phaseDesc,
        phaseId,
        generatedDate: task.GeneratedDate,
        plannedStartTime: task.PlannedStartTime ?? null,
        plannedEndTime: task.PlannedEndTime ?? null,
        actualStartTime: task.ActualStartTime ?? null,
        actualEndTime: task.ActualEndTime ?? null,
        executionTime: task.ExecutionTime ?? null,
        delayTime: task.DelayTime ?? null,
        taskObservations: task.Observations ?? null,
        supervisionObserv: task.SupervisionObserv ?? null,
        teamObservations: stripDraftObservations(task.TeamObservations),
        // Borrador de la observación en curso. Solo lo consume el campo de
        // escritura de la pantalla de ejecución; no se muestra como observación.
        draftObservations: extractDraftObservations(task.TeamObservations),
        isPaused: isPausedTask(task),
        sessionStartedAt: resolveSessionStartedAt(task),
        sessionBaseMinutes: resolveSessionBaseMinutes(task),
        hostawayReservation: task.HostawayReservation ?? null,
        checkoutDate: task.CheckoutDate ?? null,
        source: task._Source_description ?? task.Source ?? null,
        unit: unitInfo,
        employee: task.Employee
          ? { id: task.Employee, name: task._Employee_description ?? '' }
          : null,
        attachments,
        canStart: phaseDesc === 'Assigned',
        canComplete: phaseDesc === 'InExecution',
        canPause: phaseDesc === 'InExecution',
        canReview: phaseDesc === 'Completed',
        canReopen: phaseDesc === 'Completed' || phaseDesc === 'Reviewed',
        canCancel: phaseDesc === 'Assigned' || phaseDesc === 'InExecution',
        checklistDetail,
      },
    };
  }

  private async fetchUnitInfo(unitId: number, sessionToken: string) {
    try {
      const response = await this.openmaintService.getUnitById(
        unitId,
        sessionToken,
      );
      const unit = response?.data;
      if (!unit) return null;
      return {
        id: unit._id,
        code: unit.Code ?? null,
        description: unit.Description ?? null,
        name: unit.Name ?? null,
        building: unit._Building_description ?? null,
      };
    } catch {
      return null;
    }
  }

  private async fetchChecklistDetail(activityId: number | null | undefined) {
    if (!activityId) return null;
    try {
      const response =
        await this.openmaintService.getCleaningActivity(activityId);
      const act = response?.data;
      if (!act) return null;
      return {
        id: act._id,
        code: act.Code ?? null,
        description: act.Description ?? null,
        templateName: act.NombrePlantilla ?? null,
        activities: act.Detalle
          ? act.Detalle.split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
          : [],
      };
    } catch {
      return null;
    }
  }

  // ─── Transiciones de fase ─────────────────────────────────────────────────

  async startTask(taskId: number, employeeId: number, sessionToken: string) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    this.validatePhaseTransition(phaseDesc, PHASE_IDS.IN_EXECUTION);
    const now = new Date().toISOString();
    const wasPaused = isPausedTask(task);

    const body: Record<string, unknown> = { phase: PHASE_IDS.IN_EXECUTION };

    // ActualStartTime y DelayTime se registran UNA SOLA VEZ: en el primer inicio real.
    // Una tarea reabierta ya trae historial, así que no se recalculan y el retraso
    // original se conserva (de lo contrario el retraso crecería en cada reapertura,
    // porque se mediría contra la fecha en que se reinició, no la del primer inicio).
    const hasRunBefore =
      !!task.ActualStartTime ||
      this.toNumber(task.ExecutionTime) > 0 ||
      this.toNumber(task.DelayTime) > 0;

    if (!hasRunBefore) {
      body.ActualStartTime = now;

      const delayMinutes = task.PlannedStartTime
        ? this.calculateDurationMinutes(task.PlannedStartTime, now)
        : 0;
      if (delayMinutes > 0) {
        body.DelayTime = this.roundMinutes(delayMinutes);
      }
    } else {
      // Segundo arranque en adelante. La nota deja el instante en que empezó ESTA
      // ejecución, que es el ancla del cronómetro (ver resolveSessionStartedAt):
      // en el primer inicio la da ActualStartTime, pero después ese campo apunta al
      // inicio histórico y ya no sirve.
      //
      // Y la marca distingue los dos casos, porque el cronómetro no arranca igual:
      // reanudar una pausa continúa el conteo, reabrir lo empieza de cero (ver
      // resolveSessionBaseMinutes). De paso, la de reanudación cierra la pausa.
      // La de reinicio anota además el tiempo que la tarea ya arrastraba, para
      // poder descontarlo si esta sesión se pausa y se reanuda.
      const note = wasPaused
        ? `${RESUME_MARKER}: ${this.formatNoteTimestamp(now)}]`
        : `${RESTART_MARKER}: ${this.formatNoteTimestamp(now)} | ${this.formatMinutesForNote(
            this.toNumber(task.ExecutionTime),
          )}min]`;

      // El borrador se conserva tal cual: la nota entra en la bitácora y el bloque
      // entre llaves vuelve al final. Se borra solo al completar la tarea.
      body.TeamObservations = this.withDraftObservations(
        this.appendNote(stripDraftObservations(task.TeamObservations), note),
        extractDraftObservations(task.TeamObservations),
      );
    }

    const response = await this.openmaintService.updateTaskWithSession(
      taskId,
      body,
      sessionToken,
    );
    return {
      success: true,
      data: {
        id: response?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.IN_EXECUTION],
        actualStartTime: response?.data?.ActualStartTime ?? task.ActualStartTime ?? now,
        isPaused: false,
        resumed: wasPaused,
        // Ancla del cronómetro: el instante en que arrancó esta ejecución. Queda
        // guardado en OpenMAINT, así que cualquier ventana o dispositivo calcula
        // el mismo tiempo transcurrido.
        sessionStartedAt: now,
        // Con cuántos minutos arranca el cronómetro: lo trabajado en esta sesión si
        // se reanuda una pausa (sin el histórico que la tarea arrastre de antes de
        // reabrirse), y cero si la tarea se acaba de reabrir.
        sessionBaseMinutes: wasPaused
          ? Math.max(
              0,
              this.toNumber(task.ExecutionTime) -
                resolveSessionCarryMinutes(task),
            )
          : 0,
        // Lo acumulado en OpenMAINT, que es la base del total que se registrará al
        // pausar o completar (independiente de lo que muestre el cronómetro).
        executionTime: this.toNumber(task.ExecutionTime),
      },
    };
  }

  /**
   * Pausa una tarea en ejecución: vuelve a Assigned y registra el motivo en
   * TeamObservations con la marca [Pausado], que es lo que después la identifica
   * como pausada (ver isPausedTask).
   *
   * ExecutionTime se REEMPLAZA por el total trabajado hasta la pausa, para que al
   * reanudar el cronómetro arranque justo donde quedó. ActualStartTime y DelayTime
   * no se tocan: siguen describiendo el primer inicio real y su retraso.
   */
  async pauseTask(
    taskId: number,
    employeeId: number,
    dto: PauseTaskDto,
    sessionToken: string,
  ) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    // Assigned → Assigned no es una transición válida, así que esto también ataja
    // el intento de pausar una tarea que ya está pausada.
    this.validatePhaseTransition(phaseDesc, PHASE_IDS.ASSIGNED);
    if (!task.ActualStartTime) {
      throw new BadRequestException('Task must be started before pausing');
    }

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Debes indicar el motivo de la pausa');
    }

    const now = new Date().toISOString();
    const prevExecution = this.toNumber(task.ExecutionTime);
    const executionTime = this.roundMinutes(
      this.resolveTotalExecutionMinutes(
        taskId,
        task,
        dto.executionMinutes,
        prevExecution,
        now,
      ),
    );

    const body: Record<string, unknown> = {
      phase: PHASE_IDS.ASSIGNED,
      ExecutionTime: executionTime,
      // La nota de pausa entra en la bitácora; el borrador de la observación en
      // curso se guarda aparte, entre llaves y al final, para poder devolvérselo
      // al empleado cuando reanude sin que llegue a mostrarse como observación.
      TeamObservations: this.withDraftObservations(
        this.appendNote(
          stripDraftObservations(task.TeamObservations),
          `${PAUSE_MARKER}: ${this.formatNoteTimestamp(now)}]: ${this.escapeBraces(reason)}`,
        ),
        dto.draftObservations,
      ),
    };

    const response = await this.openmaintService.updateTaskWithSession(
      taskId,
      body,
      sessionToken,
    );
    return {
      success: true,
      data: {
        id: response?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.ASSIGNED],
        isPaused: true,
        reason,
        executionTime:
          this.toNumber(response?.data?.ExecutionTime) || executionTime,
      },
    };
  }

  async completeTask(
    taskId: number,
    employeeId: number,
    dto: CompleteTaskDto,
    sessionToken: string,
  ) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    this.validatePhaseTransition(phaseDesc, PHASE_IDS.COMPLETED);
    if (!task.ActualStartTime)
      throw new BadRequestException('Task must be started before completing');
    const now = new Date().toISOString();
    const prevExecution = this.toNumber(task.ExecutionTime);
    const executionTime = this.roundMinutes(
      this.resolveTotalExecutionMinutes(
        taskId,
        task,
        dto.executionMinutes,
        prevExecution,
        now,
      ),
    );

    const body: Record<string, unknown> = {
      phase: PHASE_IDS.COMPLETED,
      ActualEndTime: now,
      ExecutionTime: executionTime,
    };
    // Al completar, el borrador deja de existir: o se convierte en la observación
    // final que manda el empleado, o se descarta. En ningún caso sobrevive entre
    // llaves a una tarea ya terminada.
    const log = stripDraftObservations(task.TeamObservations);
    body.TeamObservations = dto.observations
      ? this.appendNote(log, this.escapeBraces(dto.observations))
      : (log ?? '');

    const response = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);

    // Push a los supervisores de limpieza.
    void this.notifyCleaningCompleted(task, taskId, sessionToken);

    return {
      success: true,
      data: {
        id: response?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.COMPLETED],
        actualEndTime: response?.data?.ActualEndTime ?? now,
        observations: dto.observations ?? null,
        duration: Math.round(executionTime),
        executionTime: this.toNumber(response?.data?.ExecutionTime) || executionTime,
      },
    };
  }

  /**
   * Tiempo TOTAL trabajado en la tarea, en minutos: el valor que se escribe tal
   * cual en ExecutionTime. REEMPLAZA al acumulado anterior, no se le suma.
   *
   * La fuente es el cronómetro del front, que ya no arranca en cero: parte del
   * ExecutionTime que la tarea traía de OpenMAINT y sigue corriendo. Por eso lo
   * que llega es el total y no hay nada que sumarle. Se mide de punta a punta con
   * el mismo reloj, así que no le afecta un desfase entre el dispositivo y el
   * servidor.
   *
   * Respaldos cuando el front no manda el dato:
   * - Primera ejecución: ActualStartTime es el arranque de la única sesión y sirve.
   * - Tarea reanudada o reabierta: ActualStartTime apunta al primer inicio
   *   histórico; usarlo sumaría el tiempo que estuvo detenida, así que se conserva
   *   el acumulado tal cual.
   */
  private resolveTotalExecutionMinutes(
    taskId: number,
    task: any,
    reported: number | undefined,
    prevExecution: number,
    now: string,
  ): number {
    if (typeof reported === 'number' && isFinite(reported) && reported >= 0) {
      if (reported > MAX_TOTAL_EXECUTION_MINUTES) {
        this.logger.warn(
          `Tarea ${taskId}: el front reportó ${reported} min de ejecución total, por encima ` +
            `del máximo de ${MAX_TOTAL_EXECUTION_MINUTES} min. Se acota para no corromper el dato.`,
        );
        return Math.max(MAX_TOTAL_EXECUTION_MINUTES, prevExecution);
      }
      if (reported < prevExecution) {
        this.logger.warn(
          `Tarea ${taskId}: el front reportó ${reported} min de ejecución total, por debajo del ` +
            `acumulado en OpenMAINT (${prevExecution} min). Se conserva el acumulado: el tiempo ` +
            `total nunca decrece.`,
        );
        return prevExecution;
      }
      return reported;
    }

    const hasPreviousTime = prevExecution > 0;
    if (!hasPreviousTime && task.ActualStartTime) {
      return Math.max(0, this.calculateDurationMinutes(task.ActualStartTime, now));
    }

    this.logger.warn(
      `Tarea ${taskId}: se cerró la ejecución sin executionMinutes y no es deducible (acumulado ` +
        `actual: ${prevExecution} min). Se conserva el acumulado tal cual.`,
    );
    return prevExecution;
  }

  async reviewTask(
    taskId: number,
    role: string,
    dto: ReviewTaskDto,
    sessionToken: string,
  ) {
    if (!SUPERVISOR_ROLES.includes(role))
      throw new ForbiddenException('Only supervisors can review tasks');
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (phaseDesc !== 'Completed')
      throw new BadRequestException(
        'Task must be in Completed state to review',
      );
    const targetPhaseId = dto.approved
      ? PHASE_IDS.REVIEWED
      : PHASE_IDS.ASSIGNED;
    const body: Record<string, unknown> = { phase: targetPhaseId };
    
    if (!dto.approved) {
      body.ActualEndTime = null;
    }

    if (dto.reviewComments) {
      body.Notes = dto.reviewComments;
    }

    // La nota queda siempre como bitácora, con o sin comentarios.
    const prefix = dto.approved ? '[Aprobado]' : '[Reabierto]';
    const comments = dto.reviewComments?.trim();
    body.SupervisionObserv = this.appendNote(
      task.SupervisionObserv,
      comments ? `${prefix}: ${comments}` : prefix,
    );
    const updated = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: {
        id: updated?.data?._id ?? taskId,
        phase: PHASE_NAMES[targetPhaseId],
        reviewComments: dto.reviewComments ?? null,
      },
    };
  }

  /**
   * Reabre una tarea cambiándola a Assigned.
   * El empleado debe volver a iniciarla manualmente (startTask).
   *
   * ActualStartTime y DelayTime NO se tocan: siguen describiendo el primer inicio
   * real y su retraso. Solo se limpia ActualEndTime porque la tarea vuelve a estar
   * pendiente. El tiempo de la nueva sesión se suma al ExecutionTime ya acumulado
   * cuando el empleado vuelve a completarla.
   *
   * Fases válidas: Completed, Reviewed. Solo SuperUser/SupervisorLimpieza.
   */
  async reopenTask(
    taskId: number,
    role: string,
    dto: ReopenTaskDto,
    sessionToken: string,
  ) {
    if (!SUPERVISOR_ROLES.includes(role))
      throw new ForbiddenException('Only supervisors can reopen tasks');
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!['Completed', 'Reviewed'].includes(phaseDesc)) {
      throw new BadRequestException(
        `Solo se pueden reabrir tareas en estado Completed o Reviewed. Estado actual: ${phaseDesc}`,
      );
    }
    const body: Record<string, unknown> = { 
      phase: PHASE_IDS.ASSIGNED,
      ActualEndTime: null,
    };
    // La nota queda siempre como bitácora, con o sin motivo. Ninguna vista depende
    // ya de este texto para saber si la tarea fue reabierta: eso se deduce de los datos.
    const reason = dto.observations?.trim();
    body.SupervisionObserv = this.appendNote(
      task.SupervisionObserv,
      reason ? `[Reabierto]: ${reason}` : '[Reabierto]',
    );
    const updated = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: {
        id: updated?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.ASSIGNED],
        observations: dto.observations ?? null,
        previousPhase: phaseDesc,
      },
    };
  }

  async cancelTask(
    taskId: number,
    role: string,
    dto: CancelTaskDto,
    sessionToken: string,
  ) {
    if (!SUPERVISOR_ROLES.includes(role))
      throw new ForbiddenException('Only supervisors can cancel tasks');
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!['Assigned', 'InExecution'].includes(phaseDesc)) {
      throw new BadRequestException(
        'Only tasks in Assigned or InExecution state can be cancelled',
      );
    }
    const updated = await this.openmaintService.updateTaskWithSession(
      taskId,
      { phase: PHASE_IDS.CANCELLED, Notes: dto.reason },
      sessionToken,
    );
    return {
      success: true,
      data: {
        id: updated?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.CANCELLED],
        cancelReason: dto.reason,
      },
    };
  }

  // ─── Attachments ──────────────────────────────────────────────────────────

  async getAttachments(
    taskId: number,
    employeeId: number,
    sessionToken: string,
    category?: string,
  ) {
    await this.fetchAndValidateOwnership(taskId, employeeId, sessionToken);
    return this.buildAttachmentsList(taskId, sessionToken, category);
  }

  async getAttachmentsAsSupervisor(
    taskId: number,
    sessionToken: string,
    category?: string,
  ) {
    return this.buildAttachmentsList(taskId, sessionToken, category);
  }

  private async buildAttachmentsList(
    taskId: number,
    sessionToken: string,
    category?: string,
  ) {
    const response = await this.openmaintService
      .getAttachments(taskId, sessionToken)
      .catch(() => ({ data: [] }));
    let attachments = (response.data ?? []).map((a) => ({
      id: a._id,
      fileName: a.fileName,
      category: a._category_description ?? a.category,
      uploadDate: a.created ?? a.modified ?? null,
      downloadUrl: `/cleaning-tasks/${taskId}/attachments/${a._id}/download`,
    }));
    if (category && category !== 'all') {
      attachments = attachments.filter((a) => a.category === category);
    }
    return {
      success: true,
      data: attachments,
      meta: { total: attachments.length },
    };
  }

  async uploadAttachment(
    taskId: number,
    employeeId: number,
    file: UploadedFile,
    dto: UploadAttachmentDto,
    sessionToken: string,
  ) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!ALLOWED_UPLOAD_PHASES.includes(phaseDesc))
      throw new BadRequestException(
        'Photos can only be uploaded when task is InExecution or Completed',
      );
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype))
      throw new BadRequestException(
        'Only jpg, jpeg, png, heic files are allowed',
      );
    if (file.size > MAX_FILE_SIZE_BYTES)
      throw new BadRequestException('File size must not exceed 10MB');
    const existing = await this.openmaintService.getAttachments(
      taskId,
      sessionToken,
    );
    if ((existing.data?.length ?? 0) >= MAX_ATTACHMENTS)
      throw new BadRequestException(
        `Maximum ${MAX_ATTACHMENTS} photos allowed per task`,
      );
    const categoryCode = dto.category ?? 'Photo';
    const ext = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'jpg';
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const response = await this.openmaintService.uploadAttachment(
      taskId,
      file.buffer,
      uniqueName,
      file.mimetype,
      categoryCode,
      sessionToken,
    );
    const att = response?.data;
    return {
      success: true,
      data: {
        id: att?._id ?? null,
        fileName: att?.fileName ?? uniqueName,
        category: categoryCode,
        uploadDate: att?.created ?? new Date().toISOString(),
      },
    };
  }

  /**
   * Borra una foto de la tarea. Mismas fases que la subida: mientras la tarea
   * está en ejecución o recién completada, la evidencia sigue siendo del empleado.
   */
  async deleteAttachment(
    taskId: number,
    employeeId: number,
    attachmentId: string,
    sessionToken: string,
  ) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!ALLOWED_UPLOAD_PHASES.includes(phaseDesc)) {
      throw new BadRequestException(
        'Photos can only be deleted when task is InExecution or Completed',
      );
    }

    await this.openmaintService.deleteAttachment(
      taskId,
      attachmentId,
      sessionToken,
    );
    return { success: true, data: { id: attachmentId, deleted: true } };
  }

  async streamAttachment(
    taskId: number,
    attachmentId: string,
    sessionToken: string,
    res: any,
  ): Promise<void> {
    const { data, contentType, fileName } =
      await this.openmaintService.downloadAttachment(
        taskId,
        attachmentId,
        sessionToken,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async fetchAndValidateOwnership(
    taskId: number,
    employeeId: number,
    sessionToken: string,
  ) {
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    this.validateOwnership(task.Employee, employeeId);
    return task;
  }

  private validateOwnership(
    taskEmployee: number | undefined,
    employeeId: number,
  ): void {
    if (taskEmployee !== employeeId)
      throw new ForbiddenException('This task is not assigned to you');
  }

  private validatePhaseTransition(
    currentPhaseDesc: string,
    targetPhaseId: PhaseId,
  ): void {
    const currentPhaseId = PHASE_DESC_TO_ID[currentPhaseDesc];
    if (!currentPhaseId)
      throw new BadRequestException(
        `Unknown current phase: ${currentPhaseDesc}`,
      );
    const allowed = PHASE_TRANSITIONS[currentPhaseId] ?? [];
    if (!allowed.includes(targetPhaseId)) {
      throw new BadRequestException(
        `Invalid phase transition from ${currentPhaseDesc} to ${PHASE_NAMES[targetPhaseId]}`,
      );
    }
  }

  /**
   * Minutos entre dos fechas, con decimales: el redondeo se aplica una sola vez,
   * al escribir en OpenMAINT, para no perder precisión al acumular ejecuciones.
   */
  private calculateDurationMinutes(startIso: string, endIso: string): number {
    return (
      (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000
    );
  }

  /**
   * OpenMAINT puede devolver los campos Double como número o como string.
   * Normaliza a número; cualquier valor no parseable se trata como 0.
   */
  private toNumber(value: unknown): number {
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (value == null || value === '') return 0;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Recorta la precisión de los minutos antes de guardarlos en OpenMAINT:
   * 2 decimales (~0.6 s) bastan y evitan valores como 7.000000000000001.
   */
  private roundMinutes(minutes: number): number {
    return Math.round(minutes * 100) / 100;
  }

  /**
   * Fecha y hora para las marcas de la bitácora: `2026-08-19 | 10:20`, en la zona
   * horaria del servidor. Formateada a mano y no con toLocaleString para que no
   * dependa del locale de la máquina: la marca de reanudación se vuelve a leer
   * después para reconstruir el cero del cronómetro.
   */
  private formatNoteTimestamp(isoDate: string): string {
    const date = new Date(isoDate);
    const pad = (value: number) => String(value).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return `${day} | ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /**
   * Minutos para la marca de reinicio, sin ceros de relleno: 25, 25.5, 25.53.
   * Se conserva el decimal porque de este número sale el cero del cronómetro al
   * reanudar, y redondear a minutos enteros lo desplazaría.
   */
  private formatMinutesForNote(minutes: number): string {
    return String(Number(this.roundMinutes(Math.max(0, minutes)).toFixed(2)));
  }

  /**
   * Las llaves delimitan el borrador, así que un texto del empleado que las
   * contenga se leería después como tal y desaparecería de la vista. Se cambian
   * por paréntesis antes de guardarlo.
   */
  private escapeBraces(text: string): string {
    return text.replace(/\{/g, '(').replace(/\}/g, ')');
  }

  /**
   * Deja la bitácora con el borrador pegado al final, o sin él si no hay.
   *
   * El bloque del borrador se reserva su espacio primero y entero: si se recortara
   * el total por la izquierda podría perder su llave de apertura, y entonces ni se
   * podría recuperar el texto ni dejaría de verse. Lo que cede sitio es la
   * bitácora, empezando por lo más viejo.
   */
  private withDraftObservations(
    log: string | null | undefined,
    draft: string | null | undefined,
  ): string {
    const cleanLog = stripDraftObservations(log) ?? '';
    const cleanDraft = draft?.trim() ? this.escapeBraces(draft.trim()) : null;

    if (!cleanDraft) {
      return cleanLog.length > MAX_TEAM_OBSERVATIONS
        ? cleanLog.substring(cleanLog.length - MAX_TEAM_OBSERVATIONS)
        : cleanLog;
    }

    // Del borrador se conserva el principio: es lo que el empleado escribió primero.
    const block = `{${cleanDraft.substring(0, MAX_TEAM_OBSERVATIONS - 2)}}`;
    const logBudget = MAX_TEAM_OBSERVATIONS - block.length - 2; // los dos saltos
    if (logBudget <= 0 || !cleanLog) return block;

    const trimmedLog =
      cleanLog.length > logBudget
        ? cleanLog.substring(cleanLog.length - logBudget)
        : cleanLog;

    return `${trimmedLog}\n\n${block}`;
  }

  private appendNote(existingText: string | null | undefined, newText: string): string {
    const text = (existingText ?? '').trim();
    const matches = [...text.matchAll(/^Nota (\d+)/gm)];
    let nextNumber = 1;
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      nextNumber = parseInt(lastMatch[1], 10) + 1;
    }
    
    const noteBlock = `Nota ${nextNumber}\n${newText}`;
    if (!text) {
      return noteBlock.substring(0, 500);
    }
    
    const combined = `${text}\n\n${noteBlock}`;
    return combined.length > 500 ? combined.substring(combined.length - 500) : combined;
  }

  // ─── Actualización directa ────────────────────────────────────────────────

  /**
   * Escribe en OpenMAINT solo los campos que llegan en el dto.
   *
   * Asignar un empleado NO toca `PlannedStartTime`. Antes se sobrescribía con
   * la hora actual, lo que tenía dos efectos malos: borraba el horario previsto
   * que vive en OpenMAINT, y pisaba incluso un `plannedStartTime` enviado
   * explícitamente en la misma petición. Como consecuencia, el retraso que
   * calcula `startTask` se medía contra el momento de la asignación en vez de
   * contra el horario planificado, y siempre salía cercano a cero.
   *
   * Para fijar una hora planificada hay que mandarla en `plannedStartTime`.
   */
  async updateCleaningTask(taskId: number, dto: UpdateCleaningTaskDto) {
    const body: Record<string, unknown> = {};
    if (dto.phase) body.phase = dto.phase;
    if (dto.employeeId) body.Employee = Number(dto.employeeId);
    if (dto.plannedStartTime) body.PlannedStartTime = dto.plannedStartTime;
    if (dto.plannedEndTime) body.PlannedEndTime = dto.plannedEndTime;
    if (dto.actualStartTime) body.ActualStartTime = dto.actualStartTime;
    if (dto.actualEndTime) body.ActualEndTime = dto.actualEndTime;
    if (dto.executionTime != null) body.ExecutionTime = dto.executionTime;
    if (dto.observations) body.Observations = dto.observations;

    const response = await this.openmaintService.updateCleaningTask(
      taskId,
      body,
    );

    if (dto.employeeId) {
      void this.notifyCleaningAssigned(taskId, Number(dto.employeeId));
    }

    return { updated: true, taskId: response.data?._id ?? taskId };
  }

  /** Best-effort: nunca propaga. */
  private async notifyCleaningCompleted(
    task: { Unit?: number | null; _Unit_description?: string | null; _Employee_description?: string | null },
    taskId: number,
    sessionToken: string,
  ) {
    try {
      const unit = task.Unit
        ? await this.fetchUnitInfo(task.Unit, sessionToken)
        : null;

      await this.pushDispatch.notifyCleaningCompleted({
        id: taskId,
        employeeName: task._Employee_description,
        unitName: task._Unit_description ?? unit?.description,
        buildingName: unit?.building,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar el fin de la limpieza ${taskId}: ` +
          `${(error as Error)?.message}`,
      );
    }
  }

  /** Relee la tarea para armar la ubicación. Best-effort: nunca propaga. */
  private async notifyCleaningAssigned(taskId: number, employeeId: number) {
    try {
      const task = (await this.openmaintService.getTaskByIdWithSession(taskId))
        ?.data;
      const unit = task?.Unit
        ? await this.fetchUnitInfo(task.Unit, '')
        : null;

      await this.pushDispatch.notifyCleaningAssigned({
        id: taskId,
        cleaningEmployeeId: employeeId,
        unitName: task?._Unit_description ?? unit?.description,
        buildingName: unit?.building,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar la asignación de la limpieza ${taskId}: ` +
          `${(error as Error)?.message}`,
      );
    }
  }
}
