import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CleaningTasksService,
  isSupervisorRole,
} from './cleaning-tasks.service';
import { CancelTaskDto } from './dto/cancel-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateCleaningTaskDto } from './dto/create-cleaning-task.dto';
import { GetAllCleaningTasksQueryDto } from './dto/get-all-cleaning-tasks-query.dto';
import { GetCleaningTasksQueryDto } from './dto/get-cleaning-tasks-query.dto';
import { GetCheckoutsQueryDto } from './dto/get-checkouts-query.dto';
import { PauseTaskDto } from './dto/pause-task.dto';
import { ReopenTaskDto } from './dto/reopen-task.dto';
import { ReviewTaskDto } from './dto/review-task.dto';
import { UpdateCleaningTaskDto } from './dto/update-cleaning-task.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

@ApiTags('Tareas de Limpieza')
@Controller('cleaning-tasks')
export class CleaningTasksController {
  constructor(private readonly cleaningTasksService: CleaningTasksService) {}

  // ─── Todas las tareas (supervisor) ─────────────────────────────────────────

  /**
   * GET /cleaning-tasks/all?phase=Completed&date=2026-04-16&employeeId=123&limit=50&offset=0
   * Devuelve todas las tareas de limpieza. Solo accesible por los roles
   * supervisores (SuperUser / SupervisorLimpieza).
   */
  @Get('all')
  @ApiOperation({
    summary: 'Obtener todas las tareas de limpieza (Supervisor)',
  })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión',
    required: true,
  })
  @ApiHeader({
    name: 'x-role',
    description: 'Rol del usuario (SuperUser / SupervisorLimpieza)',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Listado completo de tareas.' })
  @ApiResponse({ status: 403, description: 'Acceso no autorizado por rol.' })
  async getAllTasks(
    @Query(new ValidationPipe({ transform: true }))
    query: GetAllCleaningTasksQueryDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);

    return this.cleaningTasksService.getAllTasks(sessionToken, {
      limit: query.limit,
      offset: query.offset,
      phase: query.phase,
      date: query.date,
      employeeId: query.employeeId,
    });
  }

  // ─── Tareas del empleado autenticado (sesión del usuario) ────────────────

  /**
   * GET /cleaning-tasks/mine?limit=50&offset=0
   * Devuelve las tareas asignadas al empleado de limpieza autenticado.
   */
  @Get('mine')
  @ApiOperation({
    summary: 'Obtener tareas asignadas al empleado de limpieza autenticado',
  })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID de empleado de limpieza',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Listado de tareas del empleado.' })
  @ApiResponse({ status: 400, description: 'Cabeceras incorrectas o vacías.' })
  async getMyTasks(
    @Query(new ValidationPipe({ transform: true }))
    query: GetCleaningTasksQueryDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.getMyTasks(
      employeeId,
      sessionToken,
      query.limit,
      query.offset,
    );
  }

  // ─── Hostaway checkouts (lectura) ─────────────────────────────────────────

  @Get('checkouts')
  @ApiOperation({
    summary: 'Obtener checkouts leídos desde Hostaway (un día o un rango)',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Consultar un único día (YYYY-MM-DD). Por defecto, hoy.',
    type: 'string',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Inicio del rango (YYYY-MM-DD)',
    type: 'string',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'Fin del rango, inclusive (YYYY-MM-DD)',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de checkouts del día o rango especificado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Formato de fecha inválido o rango fuera de límites.',
  })
  async getCheckouts(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetCheckoutsQueryDto,
  ) {
    return this.cleaningTasksService.getCheckouts(query);
  }

  // ─── Sincronización Hostaway → OpenMAINT ──────────────────────────────────

  /**
   * POST /cleaning-tasks/sync/today
   * Sincroniza los checkouts del día actual.
   */
  @Post('sync/today')
  @ApiOperation({
    summary:
      'Sincronizar checkouts del día actual desde Hostaway hacia OpenMAINT',
  })
  @ApiResponse({
    status: 201,
    description: 'Sincronización finalizada correctamente.',
  })
  async syncToday() {
    const today = new Date().toISOString().split('T')[0];
    return this.cleaningTasksService.syncFromHostaway(today, today);
  }

  /**
   * POST /cleaning-tasks/sync
   * Body: { dateFrom?: string, dateTo?: string }
   */
  @Post('sync')
  @ApiOperation({
    summary:
      'Sincronizar checkouts de un rango de fechas desde Hostaway hacia OpenMAINT',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        dateFrom: {
          type: 'string',
          description: 'Fecha de inicio (YYYY-MM-DD)',
          example: '2026-06-01',
        },
        dateTo: {
          type: 'string',
          description: 'Fecha de fin (YYYY-MM-DD)',
          example: '2026-06-03',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Sincronización de rango finalizada correctamente.',
  })
  async sync(@Body() body: { dateFrom?: string; dateTo?: string }) {
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = body.dateFrom ?? today;
    const dateTo = body.dateTo ?? today;
    return this.cleaningTasksService.syncFromHostaway(dateFrom, dateTo);
  }

  // ─── Tareas de limpieza (CRUD — sistema) ──────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Listar tareas de limpieza en OpenMAINT para una fecha específica',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Filtrar por fecha (YYYY-MM-DD)',
    type: 'string',
  })
  @ApiResponse({ status: 200, description: 'Listado de tareas en OpenMAINT.' })
  async getCleaningTasks(@Query('date') date?: string) {
    return this.cleaningTasksService.getCleaningTasks(date);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva tarea de limpieza manualmente' })
  @ApiResponse({ status: 201, description: 'Tarea creada con éxito.' })
  async createCleaningTask(
    @Body(new ValidationPipe({ transform: true })) dto: CreateCleaningTaskDto,
  ) {
    return this.cleaningTasksService.createCleaningTask(dto);
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Generar múltiples tareas de limpieza a partir de checkouts',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        checkouts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              hostawayReservationId: { type: 'string', example: '12345' },
              listingName: { type: 'string', example: 'Suite Azul' },
              listingId: { type: 'string', example: '999' },
              checkoutDate: { type: 'string', example: '2026-06-03' },
              checkoutTime: { type: 'string', example: '11:00' },
              guestName: { type: 'string', example: 'Jane Doe' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Tareas generadas correctamente.' })
  async generateTasks(@Body() body: { checkouts: CreateCleaningTaskDto[] }) {
    return this.cleaningTasksService.generateTasksFromCheckouts(body.checkouts);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Actualizar campos de una tarea de limpieza por ID',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la tarea de limpieza',
    type: 'integer',
  })
  @ApiResponse({ status: 200, description: 'Tarea actualizada correctamente.' })
  async updateCleaningTask(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateCleaningTaskDto,
  ) {
    return this.cleaningTasksService.updateCleaningTask(id, dto);
  }

  // ─── Detalle y transiciones de tarea (sesión del usuario) ─────────────────
  // IMPORTANTE: estas rutas deben estar después de las estáticas para evitar
  // que ":taskId" capture "mine", "checkouts", etc.

  /**
   * GET /cleaning-tasks/:taskId
   * Detalle completo de una tarea con attachments y flags de acción.
   * - Empleado: requiere x-cleaning-employee-id y valida que la tarea le pertenezca.
   * - SuperUser/SupervisorLimpieza: no requiere x-cleaning-employee-id, omite validación de ownership.
   */
  @Get(':taskId')
  @ApiOperation({
    summary: 'Obtener detalle completo de una tarea de limpieza por ID',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID de la tarea de limpieza',
    type: 'integer',
  })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión del usuario',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID del empleado (requerido para empleados)',
    required: false,
  })
  @ApiHeader({
    name: 'x-role',
    description: 'Rol del usuario (SuperUser / SupervisorLimpieza)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la tarea de limpieza con sus adjuntos y permisos.',
  })
  @ApiResponse({
    status: 403,
    description: 'La tarea no pertenece al empleado o no tiene privilegios.',
  })
  async getTaskDetail(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string | undefined,
    @Headers('x-role') role: string | undefined,
  ) {
    this.requireSessionToken(sessionToken);

    const isSupervisor = isSupervisorRole(role);

    if (isSupervisor) {
      return this.cleaningTasksService.getTaskDetailAsSupervisor(
        taskId,
        sessionToken,
      );
    }

    const employeeId = this.parseEmployeeId(cleaningEmployeeId);
    return this.cleaningTasksService.getTaskDetail(
      taskId,
      employeeId,
      sessionToken,
    );
  }

  /**
   * PATCH /cleaning-tasks/:taskId/start
   * Transición Assigned → InExecution. Registra ActualStartTime.
   */
  @Patch(':taskId/start')
  @ApiOperation({
    summary:
      'Iniciar la ejecución de una tarea de limpieza (Assigned → InExecution)',
  })
  @ApiParam({ name: 'taskId', description: 'ID de la tarea', type: 'integer' })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID de empleado de limpieza',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Tarea iniciada con éxito.' })
  async startTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.startTask(
      taskId,
      employeeId,
      sessionToken,
    );
  }

  /**
   * PATCH /cleaning-tasks/:taskId/pause
   * Pausa una tarea en curso (InExecution → Assigned). Guarda el motivo en
   * TeamObservations tras la marca "[Pausado: 2026-08-19 | 10:20]" y reemplaza
   * ExecutionTime con el
   * tiempo trabajado hasta la pausa, para que al reanudar el cronómetro continúe
   * desde ahí. Se reanuda con el mismo endpoint de inicio (/start).
   */
  @Patch(':taskId/pause')
  @ApiOperation({
    summary:
      'Pausar una tarea de limpieza en curso (InExecution → Assigned, [Pausado])',
  })
  @ApiParam({ name: 'taskId', description: 'ID de la tarea', type: 'integer' })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID de empleado de limpieza',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Tarea pausada. El tiempo trabajado queda guardado.',
  })
  @ApiResponse({
    status: 400,
    description: 'La tarea no está en ejecución o falta el motivo de la pausa.',
  })
  async pauseTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: PauseTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.pauseTask(
      taskId,
      employeeId,
      dto,
      sessionToken,
    );
  }

  /**
   * PATCH /cleaning-tasks/:taskId/complete
   * Transición InExecution → Completed. Registra ActualEndTime y observaciones.
   */
  @Patch(':taskId/complete')
  @ApiOperation({
    summary:
      'Marcar una tarea de limpieza como completada (InExecution → Completed)',
  })
  @ApiParam({ name: 'taskId', description: 'ID de la tarea', type: 'integer' })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID de empleado de limpieza',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Tarea completada exitosamente.' })
  async completeTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: CompleteTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.completeTask(
      taskId,
      employeeId,
      dto,
      sessionToken,
    );
  }

  /**
   * PATCH /cleaning-tasks/:taskId/review
   * Transición Completed → Reviewed (o de vuelta a Assigned si rejected).
   * Solo para SuperUser/SupervisorLimpieza.
   */
  @Patch(':taskId/review')
  @ApiOperation({
    summary: 'Revisar una tarea de limpieza completada (Aprobar/Rechazar)',
  })
  @ApiParam({ name: 'taskId', description: 'ID de la tarea', type: 'integer' })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión del supervisor',
    required: true,
  })
  @ApiHeader({
    name: 'x-role',
    description: 'Rol del usuario (SuperUser / SupervisorLimpieza)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description:
      'Revisión registrada. La tarea pasa a Reviewed o retorna a Assigned.',
  })
  async reviewTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: ReviewTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);

    return this.cleaningTasksService.reviewTask(
      taskId,
      role,
      dto,
      sessionToken,
    );
  }

  /**
   * PATCH /cleaning-tasks/:taskId/reopen
   * Reabre una tarea (Completed o Reviewed) cambiándola a Assigned.
   * El empleado debe volver a iniciarla manualmente. Los tiempos originales
   * se conservan hasta ese momento. Solo SuperUser/SupervisorLimpieza.
   * Body: { observations?: string }
   */
  @Patch(':taskId/reopen')
  @ApiOperation({
    summary: 'Reabrir una tarea de limpieza (Completed/Reviewed → Assigned)',
  })
  @ApiParam({ name: 'taskId', description: 'ID de la tarea', type: 'integer' })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión del supervisor',
    required: true,
  })
  @ApiHeader({
    name: 'x-role',
    description: 'Rol del usuario (SuperUser / SupervisorLimpieza)',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Tarea reabierta y asignada nuevamente al empleado.',
  })
  async reopenTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: ReopenTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);
    return this.cleaningTasksService.reopenTask(
      taskId,
      role,
      dto,
      sessionToken,
    );
  }

  /**
   * PATCH /cleaning-tasks/:taskId/cancel
   * Cancela una tarea en estado Assigned o InExecution.
   * Solo para SuperUser/SupervisorLimpieza.
   */
  @Patch(':taskId/cancel')
  @ApiOperation({
    summary: 'Cancelar una tarea de limpieza en curso o asignada',
  })
  @ApiParam({ name: 'taskId', description: 'ID de la tarea', type: 'integer' })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión del supervisor',
    required: true,
  })
  @ApiHeader({
    name: 'x-role',
    description: 'Rol del usuario (SuperUser / SupervisorLimpieza)',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Tarea cancelada exitosamente.' })
  async cancelTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: CancelTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);

    return this.cleaningTasksService.cancelTask(
      taskId,
      role,
      dto,
      sessionToken,
    );
  }

  /**
   * GET /cleaning-tasks/:taskId/attachments?category=Photo
   * Lista los attachments de una tarea.
   * - Empleado: requiere x-cleaning-employee-id y valida ownership.
   * - SuperUser/SupervisorLimpieza: no requiere x-cleaning-employee-id, acceso directo.
   */
  @Get(':taskId/attachments')
  @ApiOperation({
    summary: 'Obtener el listado de archivos adjuntos de una tarea',
  })
  @ApiParam({ name: 'taskId', description: 'ID de la tarea', type: 'integer' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filtrar por categoría de adjunto',
    enum: ['Document', 'Image', 'Photo', 'Signature'],
  })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID de empleado de limpieza (si aplica)',
    required: false,
  })
  @ApiHeader({
    name: 'x-role',
    description: 'Rol de supervisor/administrador (si aplica)',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Lista de adjuntos obtenida.' })
  async getAttachments(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Query('category') category?: string,
    @Headers('x-session-token') sessionToken?: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId?: string,
    @Headers('x-role') role?: string,
  ) {
    this.requireSessionToken(sessionToken);

    const isSupervisor = isSupervisorRole(role);

    if (isSupervisor) {
      return this.cleaningTasksService.getAttachmentsAsSupervisor(
        taskId,
        sessionToken!,
        category,
      );
    }

    const employeeId = this.parseEmployeeId(cleaningEmployeeId);
    return this.cleaningTasksService.getAttachments(
      taskId,
      employeeId,
      sessionToken!,
      category,
    );
  }

  /**
   * GET /cleaning-tasks/:taskId/attachments/:attachmentId/download?token=SESSION_TOKEN
   * Descarga/proxea el binario de un attachment desde OpenMAINT.
   * Acepta el token como query param para poder usarse en <img src>.
   */
  @Get(':taskId/attachments/:attachmentId/download')
  @ApiOperation({ summary: 'Descargar el archivo binario de un adjunto' })
  @ApiParam({
    name: 'taskId',
    description: 'ID de la tarea de limpieza',
    type: 'integer',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'ID del archivo adjunto en OpenMAINT',
    type: 'string',
  })
  @ApiQuery({
    name: 'token',
    required: false,
    description: 'Token de sesión enviado por query param (para tags img)',
    type: 'string',
  })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión alternativo enviado por cabecera',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Flujo del archivo binario retornado.',
  })
  @ApiResponse({ status: 401, description: 'Token de sesión no proveído.' })
  async downloadAttachment(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('attachmentId') attachmentId: string,
    @Query('token') tokenFromQuery: string | undefined,
    @Headers('x-session-token') tokenFromHeader: string | undefined,
    @Res() res: Response,
  ) {
    const sessionToken = tokenFromHeader ?? tokenFromQuery;
    if (!sessionToken) {
      throw new UnauthorizedException('Session token is required');
    }

    return this.cleaningTasksService.streamAttachment(
      taskId,
      attachmentId,
      sessionToken,
      res,
    );
  }

  /**
   * POST /cleaning-tasks/:taskId/attachments
   * Sube una fotografía. Content-Type: multipart/form-data.
   * Campo "file": binario. Campo "category": Photo | Image (opcional).
   */
  @Post(':taskId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Subir un archivo adjunto (ej. fotografía) a la tarea',
  })
  @ApiParam({
    name: 'taskId',
    description: 'ID de la tarea de limpieza',
    type: 'integer',
  })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión del usuario',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID del empleado de limpieza',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo y detalles de categoría',
    schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['Document', 'Image', 'Photo', 'Signature'],
          default: 'Photo',
        },
        description: {
          type: 'string',
          description: 'Descripción corta del adjunto',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo binario a subir',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Archivo subido y asociado correctamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Entrada inválida o cabeceras faltantes',
  })
  async uploadAttachment(
    @Param('taskId', ParseIntPipe) taskId: number,
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    @Body(new ValidationPipe({ transform: true })) dto: UploadAttachmentDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.cleaningTasksService.uploadAttachment(
      taskId,
      employeeId,
      file,
      dto,
      sessionToken,
    );
  }

  /**
   * DELETE /cleaning-tasks/:taskId/attachments/:attachmentId
   * Borra una foto de evidencia de la tarea.
   */
  @Delete(':taskId/attachments/:attachmentId')
  @ApiOperation({ summary: 'Borrar un archivo adjunto de la tarea' })
  @ApiParam({
    name: 'taskId',
    description: 'ID de la tarea de limpieza',
    type: 'integer',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'ID del archivo adjunto en OpenMAINT',
    type: 'string',
  })
  @ApiHeader({
    name: 'x-session-token',
    description: 'Token de sesión',
    required: true,
  })
  @ApiHeader({
    name: 'x-cleaning-employee-id',
    description: 'ID de empleado de limpieza',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Adjunto borrado correctamente.' })
  @ApiResponse({
    status: 400,
    description: 'La fase de la tarea no permite borrar adjuntos.',
  })
  async deleteAttachment(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('attachmentId') attachmentId: string,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.deleteAttachment(
      taskId,
      employeeId,
      attachmentId,
      sessionToken,
    );
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private requireSessionToken(token: string | undefined): void {
    if (!token) {
      throw new UnauthorizedException('Session token is required');
    }
  }

  private requireRole(role: string | undefined): void {
    if (!role) {
      throw new ForbiddenException('Role header is required');
    }
  }

  private parseEmployeeId(value: string | undefined): number {
    if (!value) {
      throw new BadRequestException('Cleaning employee ID is required');
    }
    const id = parseInt(value, 10);
    if (isNaN(id)) {
      throw new BadRequestException('Invalid cleaning employee ID');
    }
    return id;
  }
}
