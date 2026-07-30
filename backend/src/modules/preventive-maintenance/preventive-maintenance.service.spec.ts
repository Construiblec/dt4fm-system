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

describe('PreventiveMaintenanceService', () => {
  let service: PreventiveMaintenanceService;
  let openmaint: OpenmaintGatewayMock;

  beforeEach(async () => {
    const openmaintMock: OpenmaintGatewayMock = {
      findByAssignee: jest.fn(),
      findById: jest.fn(),
      findWithTasklist: jest.fn(),
      advance: jest.fn(),
      findAttachments: jest.fn().mockResolvedValue({ data: [] }),
      findAttachmentPreview: jest.fn(),
      uploadAttachment: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PreventiveMaintenanceService,
        {
          provide: PreventiveMaintenanceOpenmaintService,
          useValue: openmaintMock,
        },
      ],
    }).compile();

    service = moduleRef.get(PreventiveMaintenanceService);
    openmaint = openmaintMock;
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

    it('por defecto solo pide los estados activos (Aceptación y Ejecución)', async () => {
      openmaint.findByAssignee.mockResolvedValue({ data: [] });

      await service.getMyPreventiveMaintenances(SESSION_ID, EMPLOYEE_ID, {});

      expect(openmaint.findByAssignee).toHaveBeenCalledWith(
        SESSION_ID,
        EMPLOYEE_ID,
        {
          limit: 50,
          offset: 0,
          statusIds: [PM_STATUS_IDS.ACCEPTANCE, PM_STATUS_IDS.EXECUTION],
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

    it('avanza de Aceptación a Ejecución con la acción PM02-Advance', async () => {
      openmaint.findWithTasklist.mockResolvedValue({ data: acceptanceCard });
      openmaint.findById.mockResolvedValue({ data: openmaintCard });

      const { data } = await service.startExecution(SESSION_ID, 4370994);

      expect(openmaint.advance).toHaveBeenCalledWith(SESSION_ID, 4370994, {
        activityId: 'act-1',
        action: PM_ACTIONS.START_EXECUTION,
      });
      // El detalle devuelto es el estado ya actualizado
      expect(data.statusCode).toBe('Execution');
      expect(data.canComplete).toBe(true);
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
});
