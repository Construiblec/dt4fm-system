import {
  BadGatewayException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CorrectiveFlow } from './flows/corrective-flow';
import { PreventiveFlow } from './flows/preventive-flow';
import { MaintenanceReadService } from './maintenance-read.service';

const REGISTER = `
<div class="opm_register_entry">
  <span data-block="date">10 Nov 2026</span><span data-block="time">08:00</span>
  <span data-block="step">CM01 - Opening</span>
  <span data-block="userdescr">Huésped Secreto</span>
  <span data-block="notes">Gotea el lavabo</span>
</div>
<div class="opm_register_entry">
  <span data-block="date">11 Nov 2026</span><span data-block="time">09:30</span>
  <span data-block="step">CM02 - Assignment</span>
  <span data-block="userdescr">Ana Ruiz</span>
  <span data-block="notes">Duplicada, se cancela</span>
</div>`;

const corrective = (id: number, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  Number: `CM.2026.${id}`,
  ShortDescr: 'Fuga',
  ProcessStatus: 277463,
  _ProcessStatus_code: 'CM-Execution',
  _ProcessStatus_description: 'Execution',
  _FlowStatus_code: 'open.running',
  Priority: 118,
  _Priority_description: 'Alta',
  Site: 3019998,
  _Site_description: 'Pradera',
  Unit: 300,
  _Unit_description: 'R302',
  Category: 2,
  _Category_description: 'MNT - Mantenimiento',
  Subcategory: 22,
  _Subcategory_description: 'Plomería',
  Assignee: 9,
  _Assignee_description: 'Luis Pérez',
  Team: 501,
  _Team_description: '4567',
  Requester: 77,
  _Requester_description: 'Huésped Secreto',
  OpeningDate: '2026-11-10T13:00:00Z',
  ExpExecStartDate: '2026-11-16T15:00:00Z',
  ExecStartDate: null,
  Register: REGISTER,
  ...overrides,
});

const preventive = (id: number, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  Number: `PM.2026.${id}`,
  ShortDescr: 'Revisión bomba',
  _ProcessStatus_code: 'PM-Assignment',
  _ProcessStatus_description: 'Acceptance',
  _FlowStatus_code: 'open.running',
  Site: 3019998,
  _Site_description: 'Pradera',
  Assignee: 9,
  _Assignee_description: 'Luis Pérez',
  CISubset: 40,
  _CISubset_description: 'Bomba 1',
  PrevMaintConfig: 60,
  _PrevMaintConfig_description: 'Plan mensual',
  DueExecEndDate: '2020-01-01T00:00:00Z',
  ...overrides,
});

describe('MaintenanceReadService', () => {
  const correctiveGateway = {
    search: jest.fn(),
    findById: jest.fn(),
    findAttachments: jest.fn(),
    downloadAttachment: jest.fn(),
  };
  const preventiveGateway = {
    search: jest.fn(),
    findById: jest.fn(),
    findAttachments: jest.fn(),
    downloadAttachment: jest.fn(),
  };
  const openmaint = { getEmployees: jest.fn() };
  const catalog = { list: jest.fn() };
  const checklist = { getChecklist: jest.fn() };
  const session = {
    isCoolingDown: jest.fn(),
    getSessionId: jest.fn(),
  };
  const config = { get: jest.fn() };

  let service: MaintenanceReadService;

  beforeEach(() => {
    jest.resetAllMocks();
    session.isCoolingDown.mockReturnValue(false);
    session.getSessionId.mockResolvedValue('sid');
    config.get.mockReturnValue('501,502');
    correctiveGateway.search.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });
    preventiveGateway.search.mockResolvedValue({
      data: [],
      meta: { total: 0 },
    });
    correctiveGateway.findAttachments.mockResolvedValue({ data: [] });
    preventiveGateway.findAttachments.mockResolvedValue({ data: [] });

    service = new MaintenanceReadService(
      new CorrectiveFlow(correctiveGateway as never),
      new PreventiveFlow(preventiveGateway as never),
      openmaint as never,
      catalog as never,
      checklist as never,
      session as never,
      config as never,
    );
  });

  describe('list', () => {
    it('proyecta el correctivo sin exponer a quien reportó', async () => {
      correctiveGateway.search.mockResolvedValue({
        data: [
          corrective(1),
          corrective(2, { ExecStartDate: '2026-11-16T15:05:00Z' }),
        ],
        meta: { total: 7 },
      });

      const { items, total } = await service.list('corrective', {
        limit: 50,
        offset: 0,
      });

      expect(total).toBe(7);
      expect(correctiveGateway.search).toHaveBeenCalledWith(
        'sid',
        expect.objectContaining({ limit: 50, offset: 0 }),
      );
      expect(items[0]).toMatchObject({
        kind: 'corrective',
        id: 1,
        number: 'CM.2026.1',
        title: 'Fuga',
        status: 'Assigned',
        isClosed: false,
        priority: { code: 'High', label: 'Alta' },
        building: { id: 3019998, name: 'Pradera' },
        unit: { id: 300, name: 'R302' },
        assignee: { id: 9, name: 'Luis Pérez' },
        category: { id: 2, name: 'Mantenimiento' },
        subcategory: { id: 22, name: 'Plomería', isOther: false },
        plannedStartTime: '2026-11-16T15:00:00Z',
        warnings: [],
      });
      expect(items[1]).toMatchObject({ status: 'Execution' });
      // Una descripción numérica no se expone.
      expect(items[0]).toMatchObject({ team: { id: 501, name: null } });
      expect(JSON.stringify(items)).not.toMatch(/Secreto|Requester/);
    });

    it('traduce la prioridad y el pendiente de revisión', async () => {
      correctiveGateway.search.mockResolvedValue({
        data: [
          corrective(3, {
            Priority: 117,
            ProcessStatus: 279373,
            _ProcessStatus_code: 'CM-Accounting',
            _FlowStatus_code: 'open.running',
          }),
        ],
        meta: { total: 1 },
      });

      const { items } = await service.list('corrective', {
        limit: 5,
        offset: 0,
      });

      expect(items[0]).toMatchObject({
        status: 'Accounting',
        isPendingReview: true,
        warnings: ['pending_review'],
        priority: { code: 'Critical' },
      });
    });

    it('pasa los filtros del correctivo al gateway', async () => {
      await service.list('corrective', {
        limit: 10,
        offset: 20,
        status: 'Assigned',
        priority: 'High',
        plannedFrom: '2026-11-16T05:00:00.000Z',
        plannedTo: '2026-11-17T05:00:00.000Z',
        employeeId: 9,
      } as never);

      expect(correctiveGateway.search).toHaveBeenCalledWith(
        'sid',
        expect.objectContaining({
          status: 'Assigned',
          priorityId: 118,
          employeeId: 9,
          planned: {
            from: '2026-11-16T05:00:00.000Z',
            to: '2026-11-17T05:00:00.000Z',
          },
        }),
      );
    });

    it('proyecta el preventivo con activo, plan y vencimiento', async () => {
      preventiveGateway.search.mockResolvedValue({
        data: [
          preventive(5, {
            _SuspensionReason_description: 'Falta de repuesto',
          }),
          preventive(6, { CISubset: null, CI: 41, _CI_description: 'Bomba 2' }),
        ],
        meta: { total: 2 },
      });

      const { items } = await service.list('preventive', {
        limit: 50,
        offset: 0,
      });

      expect(items[0]).toMatchObject({
        kind: 'preventive',
        status: 'Acceptance',
        asset: { id: 40, name: 'Bomba 1' },
        plan: { id: 60, name: 'Plan mensual' },
        isOverdue: true,
        suspensionReason: 'Falta de repuesto',
      });
      expect(items[1]).toMatchObject({ asset: { id: 41, name: 'Bomba 2' } });
    });

    it('un listado sin data es un fallo, no una lista vacía', async () => {
      correctiveGateway.search.mockResolvedValue({});

      await expect(
        service.list('corrective', { limit: 5, offset: 0 }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('detail', () => {
    it('correctivo: bitácora, adjuntos y motivo de cancelación', async () => {
      correctiveGateway.findById.mockResolvedValue({
        data: corrective(8, {
          ProcessStatus: 280086,
          _ProcessStatus_code: 'CM-Canceled',
          _FlowStatus_code: 'closed.completed',
        }),
      });
      correctiveGateway.findAttachments.mockResolvedValue({
        data: [
          {
            _id: 'a b',
            name: 'foto.jpg',
            fileName: '',
            _category_description: 'Photo',
            created: '2026-11-11T10:00:00Z',
          },
        ],
      });

      const detail = await service.detail('corrective', 8);

      expect(detail).toMatchObject({
        status: 'Canceled',
        isClosed: true,
        reportNotes: 'Gotea el lavabo',
        cancelReason: 'Duplicada, se cancela',
        attachments: [
          {
            id: 'a b',
            fileName: 'foto.jpg',
            category: 'Photo',
            downloadUrl: '/integrations/v1/correctives/8/attachments/a%20b',
          },
        ],
      });
      expect(
        (detail as { log: { author: string }[] }).log.map((e) => e.author),
      ).toEqual(['Ana Ruiz']);
    });

    it('cancelReason es null si la última entrada no es de CM02', async () => {
      correctiveGateway.findById.mockResolvedValue({
        data: corrective(15, {
          ProcessStatus: 280086,
          _ProcessStatus_code: 'CM-Canceled',
          Register: REGISTER.replace('CM02 - Assignment', 'CM03 - Execution'),
        }),
      });

      expect(await service.detail('corrective', 15)).toMatchObject({
        cancelReason: null,
      });
    });

    it('Assigned lleva su propia etiqueta', async () => {
      correctiveGateway.search.mockResolvedValue({
        data: [corrective(16)],
        meta: { total: 1 },
      });

      const { items } = await service.list('corrective', {
        limit: 5,
        offset: 0,
      });

      expect(items[0]).toMatchObject({
        status: 'Assigned',
        statusLabel: 'Asignado',
      });
    });

    it('una prioridad sin mapa es 502, no un filtro suelto', async () => {
      await expect(
        service.list('corrective', {
          limit: 5,
          offset: 0,
          priority: 'toString',
        } as never),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(correctiveGateway.search).not.toHaveBeenCalled();
    });

    it('cancelReason es null si no está cancelado', async () => {
      correctiveGateway.findById.mockResolvedValue({ data: corrective(9) });

      expect(await service.detail('corrective', 9)).toMatchObject({
        cancelReason: null,
      });
    });

    it('preventivo: checklist con etiquetas y conteo, solo lectura', async () => {
      preventiveGateway.findById.mockResolvedValue({ data: preventive(11) });
      checklist.getChecklist.mockResolvedValue([
        {
          order: 1,
          taskDefId: 1,
          label: 'Presión',
          kind: 'posneg',
          value: '345544',
          isResolved: true,
          equipment: 'Bomba 1',
          options: [{ id: '345544', label: 'Ok' }],
        },
        {
          order: 2,
          taskDefId: 2,
          label: 'Observaciones',
          kind: 'text',
          value: null,
          isResolved: false,
          equipment: null,
        },
      ]);

      const detail = await service.detail('preventive', 11);

      expect(detail).toMatchObject({
        checklist: {
          total: 2,
          resolved: 1,
          items: [
            { label: 'Presión', value: 'Ok', isResolved: true },
            { label: 'Observaciones', value: null, isResolved: false },
          ],
        },
        warnings: [],
      });
      expect(checklist.getChecklist).toHaveBeenCalledWith('sid', 11);
    });

    it('un desplegable sin su opción no expone el id y avisa', async () => {
      preventiveGateway.findById.mockResolvedValue({ data: preventive(17) });
      checklist.getChecklist.mockResolvedValue([
        {
          order: 1,
          taskDefId: 1,
          label: 'Presión',
          kind: 'posneg',
          value: '345544',
          isResolved: true,
          equipment: null,
          options: [],
        },
      ]);

      const detail = await service.detail('preventive', 17);

      expect(detail).toMatchObject({
        checklist: { items: [{ value: null, isResolved: true }] },
        warnings: ['checklist_unavailable'],
      });
    });

    it('si el checklist falla, avisa y no falla la ficha', async () => {
      preventiveGateway.findById.mockResolvedValue({ data: preventive(12) });
      checklist.getChecklist.mockRejectedValue(new Error('caído'));

      const detail = await service.detail('preventive', 12);

      expect(detail).toMatchObject({
        checklist: null,
        warnings: ['checklist_unavailable'],
      });
    });

    it('sin checklist asociado, checklist es null y sin aviso', async () => {
      preventiveGateway.findById.mockResolvedValue({ data: preventive(13) });
      checklist.getChecklist.mockResolvedValue([]);

      expect(await service.detail('preventive', 13)).toMatchObject({
        checklist: null,
        warnings: [],
      });
    });

    it.each([404, 400])('404 si la fuente responde %i', async (status) => {
      correctiveGateway.findById.mockRejectedValue({ response: { status } });

      await expect(service.detail('corrective', 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('una página HTML de un proxy es 502, no 404', async () => {
      correctiveGateway.findById.mockRejectedValue({
        response: { status: 404, data: '<html>proxy</html>' },
      });

      await expect(service.detail('corrective', 99)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('si fallan los adjuntos, falla la ficha', async () => {
      correctiveGateway.findById.mockResolvedValue({ data: corrective(14) });
      correctiveGateway.findAttachments.mockRejectedValue(new Error('x'));

      await expect(service.detail('corrective', 14)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('attachment', () => {
    beforeEach(() => {
      correctiveGateway.findById.mockResolvedValue({ data: corrective(20) });
      correctiveGateway.findAttachments.mockResolvedValue({
        data: [{ _id: 'att-1', name: 'foto.jpg' }],
      });
      correctiveGateway.downloadAttachment.mockResolvedValue({
        data: Buffer.from('x'),
        contentType: 'image/jpeg',
        fileName: 'otro.jpg',
      });
    });

    it('descarga un adjunto de esa orden', async () => {
      const file = await service.attachment('corrective', 20, 'att-1');

      expect(file).toEqual({
        data: Buffer.from('x'),
        contentType: 'image/jpeg',
        fileName: 'foto.jpg',
      });
      expect(correctiveGateway.downloadAttachment).toHaveBeenCalledWith(
        'sid',
        20,
        'att-1',
      );
    });

    it('404 si el adjunto no es de la orden, sin descargarlo', async () => {
      await expect(
        service.attachment('corrective', 20, 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(correctiveGateway.downloadAttachment).not.toHaveBeenCalled();
    });
  });

  describe('technicians', () => {
    const range = {
      from: '2026-11-16T05:00:00.000Z',
      to: '2026-11-18T05:00:00.000Z',
    };

    const employee = (id: number, name: string, extra = {}) => ({
      _id: id,
      Description: name,
      Team: 501,
      _Team_description: 'Mantenimiento',
      _type: 'InternalEmployee',
      ...extra,
    });

    beforeEach(() => {
      openmaint.getEmployees.mockImplementation((_sid: string, team: number) =>
        Promise.resolve({
          data:
            team === 501
              ? [employee(9, 'Luis Pérez'), employee(10, 'Ana Gómez')]
              : [
                  employee(9, 'Luis Pérez'),
                  employee(11, 'Proveedor SA', { _type: 'SupplierEmployee' }),
                ],
        }),
      );
    });

    it('agrupa la agenda por técnico y reparte planificadas, ejecución y sin fecha', async () => {
      correctiveGateway.search.mockImplementation(
        (_sid: string, options: { status: string }) =>
          Promise.resolve({
            data:
              options.status === 'Assigned'
                ? [
                    corrective(1),
                    corrective(2, { ExpExecStartDate: '2026-11-30T15:00:00Z' }),
                    corrective(3, { ExpExecStartDate: null }),
                    corrective(4, { Assignee: 999 }),
                  ]
                : options.status === 'Execution'
                  ? [corrective(5, { ExecStartDate: '2026-11-16T15:05:00Z' })]
                  : [],
            meta: { total: 4 },
          }),
      );
      preventiveGateway.search.mockImplementation(
        (_sid: string, options: { status: string }) =>
          Promise.resolve({
            data:
              options.status === 'Acceptance'
                ? [
                    preventive(6, {
                      ExpExecStartDate: '2026-11-17T15:00:00Z',
                    }),
                  ]
                : options.status === 'Planning'
                  ? [preventive(7, { Assignee: 10 })]
                  : [],
            meta: { total: 1 },
          }),
      );

      const data = await service.technicians(range);

      expect(data.map((t) => t.name)).toEqual([
        'Ana Gómez',
        'Luis Pérez',
        'Proveedor SA',
      ]);
      const luis = data.find((t) => t.id === 9);
      expect(luis).toMatchObject({
        team: { id: 501, name: 'Mantenimiento' },
        isSupplier: false,
        inExecution: [{ kind: 'corrective', id: 5 }],
      });
      expect(luis?.correctives.map((o) => o.id)).toEqual([1, 5]);
      expect(luis?.preventives.map((o) => o.id)).toEqual([6]);
      expect(luis?.unscheduled).toEqual([
        expect.objectContaining({ kind: 'corrective', id: 3 }),
      ]);
      expect(data.find((t) => t.id === 10)?.unscheduled).toEqual([
        expect.objectContaining({ kind: 'preventive', id: 7 }),
      ]);
      expect(data.find((t) => t.id === 11)?.isSupplier).toBe(true);
      // La orden de alguien fuera de los equipos no aparece en nadie.
      expect(JSON.stringify(data)).not.toContain('CM.2026.4');
    });

    it('consulta cada estado abierto con cesionario', async () => {
      await service.technicians(range);

      const statuses = (calls: unknown[][]) =>
        calls.map(([, options]) => (options as { status: string }).status);

      expect(statuses(correctiveGateway.search.mock.calls).sort()).toEqual([
        'Assigned',
        'Assignment',
        'Execution',
        'Management',
      ]);
      expect(statuses(preventiveGateway.search.mock.calls).sort()).toEqual([
        'Acceptance',
        'Execution',
        'Planning',
        'Suspension',
      ]);
      for (const [, options] of correctiveGateway.search.mock.calls) {
        expect(options).toMatchObject({ assigned: true });
      }
    });

    it('pagina la agenda', async () => {
      const page = Array.from({ length: 200 }, (_, i) =>
        corrective(1000 + i, { ExpExecStartDate: null }),
      );
      correctiveGateway.search.mockImplementation(
        (_sid: string, options: { status: string; offset: number }) =>
          Promise.resolve({
            data:
              options.status === 'Assigned'
                ? options.offset === 0
                  ? page
                  : [corrective(5000, { ExpExecStartDate: null })]
                : [],
            meta: { total: options.status === 'Assigned' ? 201 : 0 },
          }),
      );

      const data = await service.technicians(range);

      expect(data.find((t) => t.id === 9)?.unscheduled).toHaveLength(201);
    });

    it('si la agenda supera el tope, error y no respuesta incompleta', async () => {
      correctiveGateway.search.mockImplementation(() =>
        Promise.resolve({
          data: Array.from({ length: 200 }, (_, i) => corrective(i + 1)),
          meta: {},
        }),
      );

      await expect(service.technicians(range)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it.each([undefined, '', '  ', 'abc', '501,', '501,x', '0'])(
      '503 si OPENMAINT_MAINTENANCE_TEAM_IDS es %p, sin tocar la fuente',
      async (value) => {
        config.get.mockReturnValue(value);

        await expect(service.technicians(range)).rejects.toThrow(
          'El equipo de mantenimiento no está configurado',
        );
        await expect(service.technicians(range)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        expect(openmaint.getEmployees).not.toHaveBeenCalled();
      },
    );

    it('si hay más empleados que los leídos, error y no una lista incompleta', async () => {
      openmaint.getEmployees.mockResolvedValue({
        data: [employee(9, 'Luis Pérez')],
        meta: { total: 501 },
      });

      await expect(service.technicians(range)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('un fallo al leer los empleados es 502', async () => {
      openmaint.getEmployees.mockRejectedValue(new Error('caído'));

      await expect(service.technicians(range)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('categories', () => {
    it('pasa la sesión compartida al catálogo', async () => {
      catalog.list.mockResolvedValue([{ id: 1 }]);

      expect(await service.categories()).toEqual([{ id: 1 }]);
      expect(catalog.list).toHaveBeenCalledWith('sid');
    });
  });

  describe('sesión y errores', () => {
    it('503 sin llamar a la fuente si la sesión está en enfriamiento', async () => {
      session.isCoolingDown.mockReturnValue(true);

      await expect(
        service.list('corrective', { limit: 5, offset: 0 }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(correctiveGateway.search).not.toHaveBeenCalled();
    });

    it('503 si la sesión llega vacía, y nunca se pasa vacía al catálogo', async () => {
      session.getSessionId.mockResolvedValue('');

      await expect(service.categories()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(catalog.list).not.toHaveBeenCalled();
    });

    it('503 si el fallo coincide con el enfriamiento de la sesión', async () => {
      correctiveGateway.search.mockImplementation(() => {
        session.isCoolingDown.mockReturnValue(true);
        return Promise.reject(new Error('401'));
      });

      await expect(
        service.list('corrective', { limit: 5, offset: 0 }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('un fallo de la fuente es 502', async () => {
      correctiveGateway.search.mockRejectedValue(new Error('500'));

      await expect(
        service.list('corrective', { limit: 5, offset: 0 }),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('504 si se pasa el plazo', async () => {
      jest.useFakeTimers();
      try {
        correctiveGateway.search.mockReturnValue(new Promise(() => undefined));

        const pending = service.list('corrective', { limit: 5, offset: 0 });
        const assertion = expect(pending).rejects.toBeInstanceOf(
          GatewayTimeoutException,
        );
        await jest.advanceTimersByTimeAsync(20_001);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    it('503 con demasiadas lecturas a la vez, y el cupo se libera al terminar', async () => {
      const gates: Array<() => void> = [];
      correctiveGateway.search.mockImplementation(
        () =>
          new Promise((resolve) =>
            gates.push(() => resolve({ data: [], meta: { total: 0 } })),
          ),
      );

      const running = Array.from({ length: 8 }, () =>
        service.list('corrective', { limit: 5, offset: 0 }),
      );
      await new Promise((resolve) => setImmediate(resolve));

      await expect(
        service.list('corrective', { limit: 5, offset: 0 }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      gates.forEach((open) => open());
      await Promise.all(running);

      correctiveGateway.search.mockResolvedValue({
        data: [],
        meta: { total: 0 },
      });
      await expect(
        service.list('corrective', { limit: 5, offset: 0 }),
      ).resolves.toEqual({ items: [], total: 0 });
    });
  });
});
