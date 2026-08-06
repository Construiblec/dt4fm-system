import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PM_ACTIONS,
  PM_OUTCOME_POSITIVE,
  PM_STATUS_IDS,
} from './constants/preventive-maint.constants';
import { PreventiveChecklistService } from './preventive-checklist.service';
import { PreventiveMaintenanceOpenmaintService } from './preventive-maintenance.openmaint.service';
import { PreventiveMaintenanceService } from './preventive-maintenance.service';

/** Instancia real de OpenMAINT (PM.0002), recortada a los campos usados. */
const openmaintCard = {
  _id: 4370994,
  Number: 'PM.0002',
  ShortDescr: 'check list mantenimiento de prueba 1',
  ProcessStatus: PM_STATUS_IDS.EXECUTION,
  _ProcessStatus_code: 'PM-Execution',
  _ProcessStatus_description: 'Execution',
  _ProcessStatus_description_translation: 'Ejecución',
  _FlowStatus_code: 'open.running',
  Site: 1456213,
  _Site_description: 'P - Prueba',
  Assignee: 1456396,
  _Assignee_description: 'Usuario Prueba',
  Team: 1456427,
  _Team_description: 'Eq. prueba',
  PrevMaintConfig: 4351125,
  _PrevMaintConfig_description: 'PMC.0012 - Mantenimiento prueba',
  CISubset: 4350444,
  _CISubset_description: 'maquina de prueba 1',
  OpeningDate: '2026-06-03T06:00:12Z',
  ExpExecStartDate: '2026-06-04T05:00:00Z',
  DueExecEndDate: '2026-06-20T05:00:00Z',
  ExecStartDate: '2026-06-04T05:00:00Z',
  _Register_html:
    '<div><span data-block="notes">primera nota</span></div>' +
    '<div><span data-block="notes">sdfasf</span></div>',
};

const SESSION_ID = 'session-token';
const EMPLOYEE_ID = 1456396;

/**
 * El gateway se dobla como propiedades `jest.Mock` (y no con
 * `jest.Mocked<Clase>`) para poder aserciones sobre las llamadas sin disparar
 * la regla `@typescript-eslint/unbound-method`.
 */
type OpenmaintGatewayMock = Record<
  keyof PreventiveMaintenanceOpenmaintService,
  jest.Mock
>;

type ChecklistServiceMock = Record<keyof PreventiveChecklistService, jest.Mock>;

describe('PreventiveMaintenanceService', () => {
  let service: PreventiveMaintenanceService;
  let openmaint: OpenmaintGatewayMock;
  let checklist: ChecklistServiceMock;

  beforeEach(async () => {
    const openmaintMock: OpenmaintGatewayMock = {
      findByAssignee: jest.fn(),
      findByEquipment: jest.fn().mockResolvedValue({ data: [] }),
      findById: jest.fn(),
      findWithTasklist: jest.fn(),
      advance: jest.fn(),
      saveFields: jest.fn(),
      findAttachments: jest.fn().mockResolvedValue({ data: [] }),
      findAttachmentPreview: jest.fn(),
      downloadAttachment: jest.fn(),
      uploadAttachment: jest.fn(),
      findMaintenanceConfig: jest.fn(),
      findManualAttachments: jest.fn().mockResolvedValue({ data: [] }),
      downloadManualAttachment: jest.fn(),
      findChecklistCard: jest.fn(),
      updateChecklistCard: jest.fn(),
      findTaskDefinition: jest.fn(),
      findLookupValues: jest.fn(),
    };

    const checklistMock: ChecklistServiceMock = {
      getChecklist: jest.fn().mockResolvedValue([]),
      saveChecklist: jest.fn().mockResolvedValue([]),
      assertComplete: jest.fn().mockResolvedValue(undefined),
      markPendingAsNotDone: jest.fn().mockResolvedValue(0),
      clearNotDone: jest.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PreventiveMaintenanceService,
        {
          provide: PreventiveMaintenanceOpenmaintService,
          useValue: openmaintMock,
        },
        { provide: PreventiveChecklistService, useValue: checklistMock },
      ],
    }).compile();

    service = moduleRef.get(PreventiveMaintenanceService);
    openmaint = openmaintMock;
    checklist = checklistMock;
  });

  describe('getMyPreventiveMaintenances', () => {
    it('mapea la instancia de OpenMAINT al contrato público', async () => {
      openmaint.findByAssignee.mockResolvedValue({
        data: [openmaintCard],
        meta: { total: 14 },
      });

      const result = await service.getMyPreventiveMaintenances(
        SESSION_ID,
        EMPLOYEE_ID,
        {},
      );

      expect(result.meta).toEqual({ total: 14, limit: 50, offset: 0 });
      expect(result.data[0]).toMatchObject({
        id: 4370994,
        number: 'PM.0002',
        subject: 'check list mantenimiento de prueba 1',
        statusCode: 'Execution',
        status: 'Ejecución',
        isClosed: false,
        site: 'P - Prueba',
        equipment: 'maquina de prueba 1',
        plan: 'PMC.0012 - Mantenimiento prueba',
        team: 'Eq. prueba',
        assignee: 'Usuario Prueba',
        dueDate: '2026-06-20T05:00:00Z',
      });
    });

    it('por defecto pide los estados que el técnico tiene pendientes', async () => {
      openmaint.findByAssignee.mockResolvedValue({ data: [] });

      await service.getMyPreventiveMaintenances(SESSION_ID, EMPLOYEE_ID, {});

      expect(openmaint.findByAssignee).toHaveBeenCalledWith(
        SESSION_ID,
        EMPLOYEE_ID,
        {
          limit: 50,
          offset: 0,
          statusIds: [
            PM_STATUS_IDS.ACCEPTANCE,
            PM_STATUS_IDS.EXECUTION,
            PM_STATUS_IDS.SUSPENSION,
          ],
        },
      );
    });

    it('traduce el filtro de estado explícito a su ID de lookup', async () => {
      openmaint.findByAssignee.mockResolvedValue({ data: [] });

      await service.getMyPreventiveMaintenances(SESSION_ID, EMPLOYEE_ID, {
        limit: 10,
        offset: 20,
        status: 'Execution',
      });

      expect(openmaint.findByAssignee).toHaveBeenCalledWith(
        SESSION_ID,
        EMPLOYEE_ID,
        { limit: 10, offset: 20, statusIds: [PM_STATUS_IDS.EXECUTION] },
      );
    });

    it('devuelve una lista vacía cuando el empleado no tiene preventivos', async () => {
      openmaint.findByAssignee.mockResolvedValue({ data: [] });

      const result = await service.getMyPreventiveMaintenances(
        SESSION_ID,
        EMPLOYEE_ID,
        {},
      );

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('traduce un fallo de OpenMAINT a BadGatewayException', async () => {
      openmaint.findByAssignee.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        service.getMyPreventiveMaintenances(SESSION_ID, EMPLOYEE_ID, {}),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('propaga el 401 para que el frontend pueda redirigir al login', async () => {
      openmaint.findByAssignee.mockRejectedValue({ response: { status: 401 } });

      await expect(
        service.getMyPreventiveMaintenances(SESSION_ID, EMPLOYEE_ID, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('isOverdue', () => {
    it('marca como vencido un preventivo abierto cuya fecha límite ya pasó', async () => {
      openmaint.findByAssignee.mockResolvedValue({ data: [openmaintCard] });

      const result = await service.getMyPreventiveMaintenances(
        SESSION_ID,
        EMPLOYEE_ID,
        {},
      );

      expect(result.data[0].isOverdue).toBe(true);
    });

    it('no marca como vencido un preventivo ya cerrado', async () => {
      openmaint.findByAssignee.mockResolvedValue({
        data: [
          {
            ...openmaintCard,
            _FlowStatus_code: 'closed.completed',
            _ProcessStatus_code: 'PM-Completed',
          },
        ],
      });

      const result = await service.getMyPreventiveMaintenances(
        SESSION_ID,
        EMPLOYEE_ID,
        {},
      );

      expect(result.data[0].isClosed).toBe(true);
      expect(result.data[0].isOverdue).toBe(false);
    });

    it('no marca como vencido un preventivo sin fecha límite', async () => {
      openmaint.findByAssignee.mockResolvedValue({
        data: [{ ...openmaintCard, DueExecEndDate: null }],
      });

      const result = await service.getMyPreventiveMaintenances(
        SESSION_ID,
        EMPLOYEE_ID,
        {},
      );

      expect(result.data[0].isOverdue).toBe(false);
    });
  });

  describe('getPreventiveMaintenanceDetail', () => {
    it('extrae la última nota del Register y las imágenes adjuntas', async () => {
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
      openmaint.findAttachments.mockResolvedValue({
        data: [
          { _id: 'a1', name: 'evidencia.png' },
          { _id: 'a2', name: 'manual.pdf' },
        ],
      });
      openmaint.findAttachmentPreview.mockResolvedValue({
        data: { hasPreview: true, dataUrl: 'data:image/png;base64,AAA' },
      });

      const { data } = await service.getPreventiveMaintenanceDetail(
        SESSION_ID,
        4370994,
      );

      expect(data.notes).toBe('sdfasf');
      expect(data.images).toEqual(['data:image/png;base64,AAA']);
      // El PDF no se pide como vista previa
      expect(openmaint.findAttachmentPreview).toHaveBeenCalledTimes(1);
    });

    it('devuelve el detalle aunque fallen los adjuntos', async () => {
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
      openmaint.findAttachments.mockRejectedValue(new Error('boom'));

      const { data } = await service.getPreventiveMaintenanceDetail(
        SESSION_ID,
        4370994,
      );

      expect(data.number).toBe('PM.0002');
      expect(data.images).toEqual([]);
    });

    it('traduce un 404 de OpenMAINT a NotFoundException', async () => {
      openmaint.findById.mockRejectedValue({ response: { status: 404 } });

      await expect(
        service.getPreventiveMaintenanceDetail(SESSION_ID, 999999),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('traduce el 400 de "card not existing" de OpenMAINT a NotFoundException', async () => {
      // OpenMAINT responde 400, no 404, cuando la instancia no existe
      openmaint.findById.mockRejectedValue({ response: { status: 400 } });

      await expect(
        service.getPreventiveMaintenanceDetail(SESSION_ID, 999999),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('traduce otros fallos de OpenMAINT a BadGatewayException', async () => {
      openmaint.findById.mockRejectedValue({ response: { status: 500 } });

      await expect(
        service.getPreventiveMaintenanceDetail(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('propaga el 401 en lugar de tratarlo como id inexistente', async () => {
      openmaint.findById.mockRejectedValue({ response: { status: 401 } });

      await expect(
        service.getPreventiveMaintenanceDetail(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('startExecution', () => {
    const acceptanceCard = {
      ...openmaintCard,
      ProcessStatus: PM_STATUS_IDS.ACCEPTANCE,
      _ProcessStatus_code: 'PM-Assignment',
      _tasklist: [{ _id: 'act-1', _definition: 'PM02-Assignment' }],
    };

    /** La misma instancia una vez OpenMAINT la movió al paso PM03. */
    const executingCard = {
      ...openmaintCard,
      _tasklist: [{ _id: 'act-3', _definition: 'PM03-Execution' }],
    };

    /** Deja la instancia en Aceptación y, tras el avance, en Ejecución. */
    const mockAdvanceToExecution = () => {
      openmaint.findWithTasklist
        .mockResolvedValueOnce({ data: acceptanceCard })
        .mockResolvedValueOnce({ data: executingCard });
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
    };

    it('avanza de Aceptación a Ejecución con la acción PM02-Advance', async () => {
      mockAdvanceToExecution();

      const { data } = await service.startExecution(SESSION_ID, 4370994);

      expect(openmaint.advance).toHaveBeenCalledWith(SESSION_ID, 4370994, {
        activityId: 'act-1',
        action: PM_ACTIONS.START_EXECUTION,
      });
      // El detalle devuelto es el estado ya actualizado
      expect(data.statusCode).toBe('Execution');
      expect(data.canComplete).toBe(true);
    });

    it('sella la hora real de inicio una vez el proceso está en Ejecución', async () => {
      mockAdvanceToExecution();

      const before = Date.now();
      await service.startExecution(SESSION_ID, 4370994);
      const after = Date.now();

      const [call] = openmaint.saveFields.mock.calls as unknown as [
        [
          string,
          number,
          { activityId: string; fields: { ExecStartDate: string } },
        ],
      ];

      expect(call[0]).toBe(SESSION_ID);
      expect(call[1]).toBe(4370994);
      // Sobre la tarea de PM03, único paso donde ExecStartDate es escribible
      expect(call[2].activityId).toBe('act-3');

      const stamped = new Date(call[2].fields.ExecStartDate).getTime();
      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(stamped).toBeLessThanOrEqual(after);
    });

    it('no interrumpe al técnico si falla el sellado de la hora de inicio', async () => {
      mockAdvanceToExecution();
      openmaint.saveFields.mockRejectedValue(new Error('timeout'));

      const { data } = await service.startExecution(SESSION_ID, 4370994);

      expect(data.statusCode).toBe('Execution');
    });

    it('no falla si otra petición simultánea ya avanzó el mantenimiento', async () => {
      openmaint.findWithTasklist.mockResolvedValue({ data: acceptanceCard });
      openmaint.advance.mockRejectedValue(new Error('lock was not aquired'));
      openmaint.findById.mockResolvedValue({ data: openmaintCard });

      const { data } = await service.startExecution(SESSION_ID, 4370994);

      expect(data.statusCode).toBe('Execution');
      // El sellado corre en la petición que sí avanzó, no en esta
      expect(openmaint.saveFields).not.toHaveBeenCalled();
    });

    it('espera a que la petición ganadora confirme el avance', async () => {
      openmaint.findWithTasklist.mockResolvedValue({ data: acceptanceCard });
      openmaint.advance.mockRejectedValue(new Error('lock was not aquired'));
      // El bloqueo sigue vigente en la primera relectura
      openmaint.findById
        .mockResolvedValueOnce({ data: acceptanceCard })
        .mockResolvedValue({ data: openmaintCard });

      const { data } = await service.startExecution(SESSION_ID, 4370994);

      expect(data.statusCode).toBe('Execution');
    });

    it('propaga el fallo del avance si el mantenimiento sigue en Aceptación', async () => {
      openmaint.findWithTasklist.mockResolvedValue({ data: acceptanceCard });
      openmaint.advance.mockRejectedValue(new Error('ECONNREFUSED'));
      openmaint.findById.mockResolvedValue({ data: acceptanceCard });

      await expect(
        service.startExecution(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('propaga el 401 aunque el avance falle', async () => {
      openmaint.findWithTasklist.mockResolvedValue({ data: acceptanceCard });
      openmaint.advance.mockRejectedValue({ response: { status: 401 } });

      await expect(
        service.startExecution(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('falla si OpenMAINT acepta el avance pero no lo aplica', async () => {
      openmaint.findWithTasklist
        .mockResolvedValueOnce({ data: acceptanceCard })
        .mockResolvedValueOnce({ data: acceptanceCard });

      await expect(
        service.startExecution(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(BadGatewayException);

      expect(openmaint.saveFields).not.toHaveBeenCalled();
    });

    it('es idempotente: no avanza si ya está en ejecución', async () => {
      openmaint.findWithTasklist.mockResolvedValue({ data: openmaintCard });
      openmaint.findById.mockResolvedValue({ data: openmaintCard });

      const { data } = await service.startExecution(SESSION_ID, 4370994);

      expect(openmaint.advance).not.toHaveBeenCalled();
      expect(data.statusCode).toBe('Execution');
    });

    it('no avanza un mantenimiento ya completado', async () => {
      openmaint.findWithTasklist.mockResolvedValue({
        data: {
          ...openmaintCard,
          ProcessStatus: PM_STATUS_IDS.COMPLETED,
          _ProcessStatus_code: 'PM-Completed',
          _FlowStatus_code: 'closed.completed',
        },
      });
      openmaint.findById.mockResolvedValue({
        data: {
          ...openmaintCard,
          ProcessStatus: PM_STATUS_IDS.COMPLETED,
          _ProcessStatus_code: 'PM-Completed',
          _FlowStatus_code: 'closed.completed',
        },
      });

      const { data } = await service.startExecution(SESSION_ID, 4370994);

      expect(openmaint.advance).not.toHaveBeenCalled();
      expect(data.canComplete).toBe(false);
    });

    it('falla si la instancia no tiene actividad disponible', async () => {
      openmaint.findWithTasklist.mockResolvedValue({
        data: { ...acceptanceCard, _tasklist: [] },
      });

      await expect(
        service.startExecution(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('mantenimiento suspendido', () => {
      const suspendedCard = {
        ...openmaintCard,
        ProcessStatus: PM_STATUS_IDS.SUSPENSION,
        _ProcessStatus_code: 'PM-Suspension',
        _tasklist: [{ _id: 'act-4', _definition: 'PM04-Suspension' }],
      };

      beforeEach(() => {
        openmaint.findWithTasklist.mockResolvedValue({ data: suspendedCard });
        openmaint.findById.mockResolvedValue({ data: suspendedCard });
      });

      it('no lo reanuda: esa transición se hace en OpenMAINT', async () => {
        const { data } = await service.startExecution(SESSION_ID, 4370994);

        expect(openmaint.advance).not.toHaveBeenCalled();
        expect(data.statusCode).toBe('Suspension');
        expect(data.canSuspend).toBe(false);
      });

      it('deja el checklist marcado como N.D. mientras siga suspendido', async () => {
        await service.startExecution(SESSION_ID, 4370994);

        expect(checklist.clearNotDone).not.toHaveBeenCalled();
      });
    });

    describe('checklist tras una suspensión', () => {
      it('devuelve a pendientes las actividades N.D. al abrirlo en Ejecución', async () => {
        openmaint.findWithTasklist.mockResolvedValue({ data: openmaintCard });
        openmaint.findById.mockResolvedValue({ data: openmaintCard });

        await service.startExecution(SESSION_ID, 4370994);

        expect(checklist.clearNotDone).toHaveBeenCalledWith(
          SESSION_ID,
          4370994,
        );
      });

      it('no interrumpe al técnico si falla la limpieza del N.D.', async () => {
        openmaint.findWithTasklist.mockResolvedValue({ data: openmaintCard });
        openmaint.findById.mockResolvedValue({ data: openmaintCard });
        checklist.clearNotDone.mockRejectedValue(new Error('boom'));

        const { data } = await service.startExecution(SESSION_ID, 4370994);

        expect(data.statusCode).toBe('Execution');
      });
    });
  });

  describe('completePreventiveMaintenance', () => {
    const executionCard = {
      ...openmaintCard,
      ProcessStatus: PM_STATUS_IDS.EXECUTION,
      _tasklist: [{ _id: 'act-3', _definition: 'PM03-Execution' }],
    };

    const completedCard = {
      ...openmaintCard,
      ProcessStatus: PM_STATUS_IDS.COMPLETED,
      _ProcessStatus_code: 'PM-Completed',
      _FlowStatus_code: 'closed.completed',
    };

    /** Atributos obligatorios enviados en el último `advance`. */
    const advancedFields = (): Record<string, string> => {
      const [call] = openmaint.advance.mock.calls as unknown as [
        [string, number, { fields?: Record<string, string> }],
      ];

      return call?.[2]?.fields ?? {};
    };

    beforeEach(() => {
      openmaint.findWithTasklist.mockResolvedValue({ data: executionCard });
      // La verificación posterior al avance ve el proceso ya cerrado
      openmaint.findById.mockResolvedValue({ data: completedCard });
    });

    it('cierra con PM03-Advance, resultado positivo y notas', async () => {
      const result = await service.completePreventiveMaintenance(
        SESSION_ID,
        4370994,
        { notes: '  checklist ok  ' },
      );

      expect(openmaint.advance).toHaveBeenCalledWith(
        SESSION_ID,
        4370994,
        expect.objectContaining({
          activityId: 'act-3',
          action: PM_ACTIONS.CONCLUDE,
          outcome: PM_OUTCOME_POSITIVE,
          notes: 'checklist ok',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('envía ExecStartDate y ExecEndDate, obligatorios en PM03', async () => {
      await service.completePreventiveMaintenance(SESSION_ID, 4370994, {});

      const fields = advancedFields();

      // Conserva el inicio real ya registrado y cierra con la fecha actual
      expect(fields.ExecStartDate).toBe(openmaintCard.ExecStartDate);
      expect(Date.parse(fields.ExecEndDate)).not.toBeNaN();
    });

    it('usa la fecha actual como inicio si el proceso no lo tenía', async () => {
      openmaint.findWithTasklist.mockResolvedValue({
        data: { ...executionCard, ExecStartDate: null },
      });

      await service.completePreventiveMaintenance(SESSION_ID, 4370994, {});

      const fields = advancedFields();

      expect(Date.parse(fields.ExecStartDate)).not.toBeNaN();
    });

    it('falla si OpenMAINT acepta el avance pero no cambia el estado', async () => {
      // OpenMAINT responde 200 y guarda atributos sin avanzar el flujo
      openmaint.findById.mockResolvedValue({ data: executionCard });

      await expect(
        service.completePreventiveMaintenance(SESSION_ID, 4370994, {}),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('sube la evidencia cuando se adjunta una imagen', async () => {
      const file = {
        buffer: Buffer.from('x'),
        originalname: 'evidencia.png',
        mimetype: 'image/png',
      };

      await service.completePreventiveMaintenance(
        SESSION_ID,
        4370994,
        {},
        file,
      );

      expect(openmaint.uploadAttachment).toHaveBeenCalledWith(
        SESSION_ID,
        4370994,
        file,
      );
    });

    it('cierra igualmente aunque falle la subida de la evidencia', async () => {
      openmaint.uploadAttachment.mockRejectedValue(new Error('boom'));

      const result = await service.completePreventiveMaintenance(
        SESSION_ID,
        4370994,
        {},
        {
          buffer: Buffer.from('x'),
          originalname: 'e.png',
          mimetype: 'image/png',
        },
      );

      expect(result.success).toBe(true);
    });

    it('exige el checklist completo antes de intentar el avance', async () => {
      checklist.assertComplete.mockRejectedValue(
        new ConflictException('Faltan 3 actividades del checklist'),
      );

      await expect(
        service.completePreventiveMaintenance(SESSION_ID, 4370994, {}),
      ).rejects.toBeInstanceOf(ConflictException);

      // No se molesta a OpenMAINT con un avance que rechazaría en silencio
      expect(openmaint.advance).not.toHaveBeenCalled();
    });

    it('rechaza cerrar uno que no está en ejecución', async () => {
      openmaint.findWithTasklist.mockResolvedValue({
        data: {
          ...openmaintCard,
          ProcessStatus: PM_STATUS_IDS.ACCEPTANCE,
          _tasklist: [{ _id: 'act-1' }],
        },
      });

      await expect(
        service.completePreventiveMaintenance(SESSION_ID, 4370994, {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(openmaint.advance).not.toHaveBeenCalled();
    });
  });

  describe('suspendPreventiveMaintenance', () => {
    const REASON_ID = 266683;

    const executionCard = {
      ...openmaintCard,
      ProcessStatus: PM_STATUS_IDS.EXECUTION,
      _tasklist: [{ _id: 'act-3', _definition: 'PM03-Execution' }],
    };

    const suspendedCard = {
      ...openmaintCard,
      ProcessStatus: PM_STATUS_IDS.SUSPENSION,
      _ProcessStatus_code: 'PM-Suspension',
      SuspensionReason: REASON_ID,
      _SuspensionReason_description_translation: 'Esperando repuestos',
    };

    beforeEach(() => {
      openmaint.findWithTasklist.mockResolvedValue({ data: executionCard });
      openmaint.findById.mockResolvedValue({ data: suspendedCard });
    });

    it('suspende con la acción PM03-Back, el motivo y las notas', async () => {
      const result = await service.suspendPreventiveMaintenance(
        SESSION_ID,
        4370994,
        { reasonId: REASON_ID, notes: '  falta el repuesto  ' },
      );

      expect(openmaint.advance).toHaveBeenCalledWith(SESSION_ID, 4370994, {
        activityId: 'act-3',
        action: PM_ACTIONS.SUSPEND,
        notes: 'falta el repuesto',
        fields: { SuspensionReason: REASON_ID },
      });
      expect(result.success).toBe(true);
    });

    it('no exige el checklist completo', async () => {
      await service.suspendPreventiveMaintenance(SESSION_ID, 4370994, {
        reasonId: REASON_ID,
      });

      expect(checklist.assertComplete).not.toHaveBeenCalled();
      expect(openmaint.advance).toHaveBeenCalled();
    });

    it('guarda las respuestas recibidas antes de marcar el resto como N.D.', async () => {
      const items = [{ taskDefId: 6861754, value: 'sin novedades' }];

      await service.suspendPreventiveMaintenance(SESSION_ID, 4370994, {
        reasonId: REASON_ID,
        items,
      });

      expect(checklist.saveChecklist).toHaveBeenCalledWith(
        SESSION_ID,
        4370994,
        items,
      );
      expect(checklist.saveChecklist.mock.invocationCallOrder[0]).toBeLessThan(
        checklist.markPendingAsNotDone.mock.invocationCallOrder[0],
      );
    });

    it('marca como N.D. las pendientes antes de avanzar', async () => {
      await service.suspendPreventiveMaintenance(SESSION_ID, 4370994, {
        reasonId: REASON_ID,
      });

      expect(checklist.markPendingAsNotDone).toHaveBeenCalledWith(
        SESSION_ID,
        4370994,
      );
      expect(
        checklist.markPendingAsNotDone.mock.invocationCallOrder[0],
      ).toBeLessThan(openmaint.advance.mock.invocationCallOrder[0]);
    });

    it('no guarda el checklist si no viajan respuestas', async () => {
      await service.suspendPreventiveMaintenance(SESSION_ID, 4370994, {
        reasonId: REASON_ID,
        items: [],
      });

      expect(checklist.saveChecklist).not.toHaveBeenCalled();
      expect(checklist.markPendingAsNotDone).toHaveBeenCalled();
    });

    it('falla si OpenMAINT acepta el avance pero no cambia el estado', async () => {
      openmaint.findById.mockResolvedValue({ data: executionCard });

      await expect(
        service.suspendPreventiveMaintenance(SESSION_ID, 4370994, {
          reasonId: REASON_ID,
        }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('rechaza suspender uno que no está en ejecución', async () => {
      openmaint.findWithTasklist.mockResolvedValue({
        data: {
          ...openmaintCard,
          ProcessStatus: PM_STATUS_IDS.ACCEPTANCE,
          _tasklist: [{ _id: 'act-1' }],
        },
      });

      await expect(
        service.suspendPreventiveMaintenance(SESSION_ID, 4370994, {
          reasonId: REASON_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(openmaint.advance).not.toHaveBeenCalled();
    });

    it('rechaza suspender uno ya suspendido', async () => {
      openmaint.findWithTasklist.mockResolvedValue({
        data: { ...suspendedCard, _tasklist: [{ _id: 'act-4' }] },
      });

      await expect(
        service.suspendPreventiveMaintenance(SESSION_ID, 4370994, {
          reasonId: REASON_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(openmaint.advance).not.toHaveBeenCalled();
    });

    it('expone el motivo en el detalle mientras está suspendido', async () => {
      openmaint.findById.mockResolvedValue({ data: suspendedCard });

      const { data } = await service.getPreventiveMaintenanceDetail(
        SESSION_ID,
        4370994,
      );

      expect(data.statusCode).toBe('Suspension');
      expect(data.suspensionReason).toBe('Esperando repuestos');
      expect(data.canSuspend).toBe(false);
    });
  });

  describe('getEquipmentHistory', () => {
    /** Preventivo anterior cerrado sobre el mismo equipo. */
    const previousCard = {
      ...openmaintCard,
      _id: 4360001,
      Number: 'PM.0001',
      ProcessStatus: PM_STATUS_IDS.COMPLETED,
      _ProcessStatus_code: 'PM-Completed',
      _FlowStatus_code: 'closed.completed',
      ExecEndDate: '2026-05-20T12:00:00Z',
    };

    beforeEach(() => {
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
    });

    it('busca por el equipo de la tarjeta y solo los completados', async () => {
      await service.getEquipmentHistory(SESSION_ID, 4370994, {});

      expect(openmaint.findByEquipment).toHaveBeenCalledWith(SESSION_ID, {
        equipmentAttr: 'CISubset',
        equipmentId: 4350444,
        limit: 11,
        offset: 0,
        statusIds: [PM_STATUS_IDS.COMPLETED],
      });
    });

    it('cae a CI cuando la tarjeta no tiene CISubset', async () => {
      openmaint.findById.mockResolvedValue({
        data: {
          ...openmaintCard,
          CISubset: null,
          _CISubset_description: null,
          CI: 4350999,
          _CI_description: 'activo generico',
        },
      });

      await service.getEquipmentHistory(SESSION_ID, 4370994, {});

      expect(openmaint.findByEquipment).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ equipmentAttr: 'CI', equipmentId: 4350999 }),
      );
    });

    it('devuelve una lista vacía si el mantenimiento no tiene equipo', async () => {
      openmaint.findById.mockResolvedValue({
        data: { ...openmaintCard, CISubset: null, CI: null },
      });

      const result = await service.getEquipmentHistory(SESSION_ID, 4370994, {});

      expect(result.data).toEqual([]);
      expect(result.meta.equipment).toBeNull();
      expect(openmaint.findByEquipment).not.toHaveBeenCalled();
    });

    it('excluye el propio mantenimiento y respeta el límite pedido', async () => {
      openmaint.findByEquipment.mockResolvedValue({
        data: [openmaintCard, previousCard, { ...previousCard, _id: 4360002 }],
      });

      const result = await service.getEquipmentHistory(SESSION_ID, 4370994, {
        limit: 1,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(4360001);
      expect(result.data[0].number).toBe('PM.0001');
    });

    it('cuenta los adjuntos de cada mantenimiento anterior', async () => {
      openmaint.findByEquipment.mockResolvedValue({ data: [previousCard] });
      openmaint.findAttachments.mockResolvedValue({
        data: [{ _id: 'a1', fileName: 'informe.pdf' }],
      });

      const result = await service.getEquipmentHistory(SESSION_ID, 4370994, {});

      expect(result.data[0].attachmentCount).toBe(1);
    });

    it('cuenta cero si falla la consulta de adjuntos de una fila', async () => {
      openmaint.findByEquipment.mockResolvedValue({ data: [previousCard] });
      openmaint.findAttachments.mockRejectedValue(new Error('boom'));

      const result = await service.getEquipmentHistory(SESSION_ID, 4370994, {});

      expect(result.data[0].attachmentCount).toBe(0);
    });

    it('traduce un fallo de OpenMAINT a BadGatewayException', async () => {
      openmaint.findByEquipment.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        service.getEquipmentHistory(SESSION_ID, 4370994, {}),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('propaga el 401 para que el frontend pueda redirigir al login', async () => {
      openmaint.findByEquipment.mockRejectedValue({
        response: { status: 401 },
      });

      await expect(
        service.getEquipmentHistory(SESSION_ID, 4370994, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getAttachments', () => {
    beforeEach(() => {
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
    });

    it('mapea cada adjunto con su ruta de descarga', async () => {
      openmaint.findAttachments.mockResolvedValue({
        data: [
          {
            _id: 'a1',
            fileName: 'informe.pdf',
            _category_description: 'Documento',
            created: '2026-06-05T10:00:00Z',
          },
        ],
      });

      const { data } = await service.getAttachments(SESSION_ID, 4370994);

      expect(data).toEqual([
        {
          id: 'a1',
          fileName: 'informe.pdf',
          category: 'Documento',
          description: null,
          uploadDate: '2026-06-05T10:00:00Z',
          downloadUrl:
            '/preventive-maintenance/4370994/attachments/a1/download',
          isImage: false,
          isReport: false,
        },
      ]);
    });

    it('marca como informe el PDF que genera OpenMAINT al cerrar', async () => {
      openmaint.findAttachments.mockResolvedValue({
        data: [
          {
            _id: 'r1',
            name: 'PM.0002_Informe de actividades_20260805_095932.pdf',
            // La marca la pone OpenMAINT con el número de la instancia
            description: '[PM.0002] Informe de actividades 2026-08-05 09:59:32',
          },
          { _id: 'd1', name: 'ficha.pdf', description: 'Ficha del proveedor' },
        ],
      });

      const { data } = await service.getAttachments(SESSION_ID, 4370994);

      expect(data.map((a) => [a.id, a.isReport])).toEqual([
        ['r1', true],
        ['d1', false],
      ]);
    });

    it('marca como imagen los adjuntos con extensión de imagen', async () => {
      openmaint.findAttachments.mockResolvedValue({
        data: [{ _id: 'a2', name: 'evidencia.PNG' }],
      });

      const { data } = await service.getAttachments(SESSION_ID, 4370994);

      expect(data[0].isImage).toBe(true);
      expect(data[0].fileName).toBe('evidencia.PNG');
    });

    it('devuelve una lista vacía si OpenMAINT falla al listarlos', async () => {
      openmaint.findAttachments.mockRejectedValue(new Error('boom'));

      const result = await service.getAttachments(SESSION_ID, 4370994);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('propaga el 401 en lugar de devolver una lista vacía', async () => {
      openmaint.findAttachments.mockRejectedValue({
        response: { status: 401 },
      });

      await expect(
        service.getAttachments(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('falla con NotFound si el mantenimiento no existe', async () => {
      openmaint.findById.mockRejectedValue({ response: { status: 404 } });

      await expect(
        service.getAttachments(SESSION_ID, 999999),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('uploadDocument', () => {
    const file = {
      buffer: Buffer.from('%PDF'),
      originalname: 'ficha.pdf',
      mimetype: 'application/pdf',
    };

    it('adjunta el documento y devuelve la lista actualizada', async () => {
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
      openmaint.findAttachments.mockResolvedValue({
        data: [{ _id: 'd1', name: 'ficha.pdf' }],
      });

      const result = await service.uploadDocument(SESSION_ID, 4370994, file);

      expect(openmaint.uploadAttachment).toHaveBeenCalledWith(
        SESSION_ID,
        4370994,
        file,
      );
      expect(result.data[0].fileName).toBe('ficha.pdf');
    });

    it('rechaza adjuntar a un mantenimiento ya completado', async () => {
      openmaint.findById.mockResolvedValue({
        data: { ...openmaintCard, ProcessStatus: PM_STATUS_IDS.COMPLETED },
      });

      await expect(
        service.uploadDocument(SESSION_ID, 4370994, file),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(openmaint.uploadAttachment).not.toHaveBeenCalled();
    });

    it('traduce un fallo de la subida a BadGatewayException', async () => {
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
      openmaint.uploadAttachment.mockRejectedValue(new Error('boom'));

      await expect(
        service.uploadDocument(SESSION_ID, 4370994, file),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('getEquipmentDocuments', () => {
    beforeEach(() => {
      openmaint.findById.mockResolvedValue({ data: openmaintCard });
      openmaint.findMaintenanceConfig.mockResolvedValue({
        data: {
          _id: 4351125,
          MaintManual: 7185465,
          _MaintManual_description: 'MM-P - Prueba',
        },
      });
    });

    it('recorre plan → manual y mapea sus archivos', async () => {
      openmaint.findManualAttachments.mockResolvedValue({
        data: [
          {
            _id: 'm1',
            name: 'Manual OpenMaint.pdf',
            description: 'Manual de prueba',
            _category_description: 'Document',
            created: '2026-08-06T13:48:28.216Z',
          },
        ],
      });

      const result = await service.getEquipmentDocuments(SESSION_ID, 4370994);

      expect(openmaint.findMaintenanceConfig).toHaveBeenCalledWith(
        SESSION_ID,
        4351125,
      );
      expect(openmaint.findManualAttachments).toHaveBeenCalledWith(
        SESSION_ID,
        7185465,
      );
      expect(result.data).toEqual([
        {
          id: 'm1',
          // Los adjuntos de clase traen `name`, no `fileName`
          fileName: 'Manual OpenMaint.pdf',
          category: 'Document',
          description: 'Manual de prueba',
          uploadDate: '2026-08-06T13:48:28.216Z',
          downloadUrl: '/preventive-maintenance/4370994/documents/m1/download',
          isImage: false,
          isReport: false,
        },
      ]);
      expect(result.meta.manual).toBe('MM-P - Prueba');
    });

    it('devuelve una lista vacía si el mantenimiento no tiene plan', async () => {
      openmaint.findById.mockResolvedValue({
        data: { ...openmaintCard, PrevMaintConfig: null },
      });

      const result = await service.getEquipmentDocuments(SESSION_ID, 4370994);

      expect(result.data).toEqual([]);
      expect(openmaint.findMaintenanceConfig).not.toHaveBeenCalled();
    });

    it('devuelve una lista vacía si el plan no tiene manual', async () => {
      openmaint.findMaintenanceConfig.mockResolvedValue({
        data: { _id: 4351125, MaintManual: null },
      });

      const result = await service.getEquipmentDocuments(SESSION_ID, 4370994);

      expect(result.data).toEqual([]);
      expect(openmaint.findManualAttachments).not.toHaveBeenCalled();
    });

    it('propaga el 401 al resolver el manual', async () => {
      openmaint.findMaintenanceConfig.mockRejectedValue({
        response: { status: 401 },
      });

      await expect(
        service.getEquipmentDocuments(SESSION_ID, 4370994),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('streamAttachment', () => {
    const buildResponse = () => ({
      setHeader: jest.fn(),
      send: jest.fn(),
    });

    it('reenvía el binario con su tipo y nombre de archivo', async () => {
      openmaint.downloadAttachment.mockResolvedValue({
        data: Buffer.from('pdf'),
        contentType: 'application/pdf',
        fileName: 'informe.pdf',
      });
      const res = buildResponse();

      await service.streamAttachment(
        SESSION_ID,
        4370994,
        'a1',
        res as unknown as Parameters<typeof service.streamAttachment>[3],
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'inline; filename="informe.pdf"',
      );
      expect(res.send).toHaveBeenCalled();
    });

    it('traduce un 404 de OpenMAINT a NotFoundException', async () => {
      openmaint.downloadAttachment.mockRejectedValue({
        response: { status: 404 },
      });
      const res = buildResponse();

      await expect(
        service.streamAttachment(
          SESSION_ID,
          4370994,
          'inexistente',
          res as unknown as Parameters<typeof service.streamAttachment>[3],
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getSuspensionReasons', () => {
    it('mapea los valores del lookup usando la descripción traducida', async () => {
      openmaint.findLookupValues.mockResolvedValue({
        data: [
          {
            _id: 266683,
            code: 'Replacement',
            description: 'Awaiting spare parts',
            _description_translation: 'Esperando repuestos',
          },
        ],
      });

      const { data } = await service.getSuspensionReasons(SESSION_ID);

      expect(data).toEqual([{ id: '266683', label: 'Esperando repuestos' }]);
    });

    it('descarta los valores inactivos', async () => {
      openmaint.findLookupValues.mockResolvedValue({
        data: [
          { _id: 266685, description: 'Other', active: false },
          { _id: 266681, description: 'Supplier' },
        ],
      });

      const { data } = await service.getSuspensionReasons(SESSION_ID);

      expect(data).toEqual([{ id: '266681', label: 'Supplier' }]);
    });

    it('traduce un fallo de OpenMAINT a BadGatewayException', async () => {
      openmaint.findLookupValues.mockRejectedValue(new Error('boom'));

      await expect(
        service.getSuspensionReasons(SESSION_ID),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('propaga el 401 para que el frontend pueda redirigir al login', async () => {
      openmaint.findLookupValues.mockRejectedValue({
        response: { status: 401 },
      });

      await expect(
        service.getSuspensionReasons(SESSION_ID),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
