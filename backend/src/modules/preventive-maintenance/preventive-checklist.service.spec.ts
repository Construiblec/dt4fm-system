import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CHECKLIST_FIELD_TYPES } from './constants/checklist.constants';
import { PreventiveChecklistService } from './preventive-checklist.service';
import { PreventiveMaintenanceOpenmaintService } from './preventive-maintenance.openmaint.service';

const SESSION_ID = 'session-token';
const PROCESS_ID = 6900186;
const CARD_ID = 6953310;

/** Una actividad de `Data` tal como la devuelve OpenMAINT. */
const rawItem = (
  order: number,
  type: number,
  taskDef: number,
  overrides: Record<string, unknown> = {},
) => ({
  CI: 4804473,
  ND: false,
  Site: 1456213,
  Type: type,
  Outcome: null,
  TaskDef: taskDef,
  Modified: false,
  ExecOrder: order,
  _CI_description: 'eb6bc3132144b0ff2bgqp4 - Sensor - prueba',
  _Site_description: 'P - Prueba',
  _TaskDef_description: `Actividad ${order}`,
  ...overrides,
});

const T = CHECKLIST_FIELD_TYPES;

/** Checklist de prueba con los 8 tipos de campo que existen. */
const allTypeItems = [
  rawItem(1, T.DATE, 6861754),
  rawItem(2, T.TIME, 6861757),
  rawItem(3, T.NUMBER, 6861760),
  rawItem(4, T.LOOKUP, 6861763),
  rawItem(5, T.LOOKUP, 6861766),
  rawItem(6, T.POS_NEG, 6861769),
  rawItem(7, T.TEXT, 6861772),
  rawItem(8, T.FLAG, 6861775),
  rawItem(9, T.TIMESTAMP, 6861778),
];

const card = (items: unknown[]) => ({
  _id: CARD_ID,
  MaintProcess: PROCESS_ID,
  Data: JSON.stringify(items),
});

const outcomeLookupValues = [
  {
    _id: 345544,
    code: 'Ok',
    description: 'Positive',
    _description_translation: 'Positivo',
  },
  {
    _id: 345546,
    code: 'Ko',
    description: 'Negative',
    _description_translation: 'Negativo',
  },
  {
    _id: 345548,
    code: 'Done',
    description: 'Done',
    _description_translation: 'Hecho',
  },
  {
    _id: 345550,
    code: 'ToDo',
    description: 'To do',
    _description_translation: 'Que hacer',
  },
];

type GatewayMock = Record<
  keyof PreventiveMaintenanceOpenmaintService,
  jest.Mock
>;

describe('PreventiveChecklistService', () => {
  let service: PreventiveChecklistService;
  let openmaint: GatewayMock;

  beforeEach(async () => {
    const mock: GatewayMock = {
      findByAssignee: jest.fn(),
      findAll: jest.fn(),
      findByEquipment: jest.fn(),
      downloadAttachment: jest.fn(),
      deleteAttachment: jest.fn(),
      findManualAttachments: jest.fn(),
      downloadManualAttachment: jest.fn(),
      findMaintenanceConfig: jest.fn(),
      findById: jest.fn(),
      findWithTasklist: jest.fn(),
      advance: jest.fn(),
      saveFields: jest.fn(),
      findAttachments: jest.fn(),
      findAttachmentPreview: jest.fn(),
      uploadAttachment: jest.fn(),
      findChecklistCard: jest.fn(),
      updateChecklistCard: jest.fn().mockResolvedValue({ success: true }),
      findTaskDefinition: jest.fn().mockResolvedValue({
        data: { _LookupType_description: 'COMMON - Currency' },
      }),
      findLookupValues: jest.fn().mockResolvedValue({
        data: outcomeLookupValues,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PreventiveChecklistService,
        { provide: PreventiveMaintenanceOpenmaintService, useValue: mock },
      ],
    }).compile();

    service = moduleRef.get(PreventiveChecklistService);
    openmaint = mock;
  });

  describe('getChecklist', () => {
    it('mapea cada Type de OpenMAINT a su clase de campo', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card(allTypeItems)],
      });

      const items = await service.getChecklist(SESSION_ID, PROCESS_ID);

      expect(items.map((item) => item.kind)).toEqual([
        'date',
        'time',
        'number',
        'lookup',
        'lookup',
        'posneg',
        'text',
        'flag',
        'datetime',
      ]);
    });

    it('ordena las actividades por ExecOrder aunque lleguen desordenadas', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [
          card([
            rawItem(3, T.TEXT, 300),
            rawItem(1, T.TEXT, 100),
            rawItem(2, T.TEXT, 200),
          ]),
        ],
      });

      const items = await service.getChecklist(SESSION_ID, PROCESS_ID);

      expect(items.map((item) => item.order)).toEqual([1, 2, 3]);
      expect(items.map((item) => item.taskDefId)).toEqual([100, 200, 300]);
    });

    it('reparte las opciones del lookup fijo entre posneg y flag', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.POS_NEG, 10), rawItem(2, T.FLAG, 20)])],
      });

      const [posneg, flag] = await service.getChecklist(SESSION_ID, PROCESS_ID);

      expect(posneg.options).toEqual([
        { id: '345544', label: 'Positivo' },
        { id: '345546', label: 'Negativo' },
      ]);
      expect(flag.options).toEqual([
        { id: '345548', label: 'Hecho' },
        { id: '345550', label: 'Que hacer' },
      ]);
      // Un solo viaje al lookup compartido
      expect(openmaint.findLookupValues).toHaveBeenCalledTimes(1);
    });

    it('resuelve las listas configurables leyendo la definición de la actividad', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.LOOKUP, 6861763)])],
      });
      openmaint.findLookupValues.mockResolvedValue({
        data: [
          { _id: 267382, code: 'USD', description: 'United States Dollar' },
        ],
      });

      const [item] = await service.getChecklist(SESSION_ID, PROCESS_ID);

      expect(openmaint.findTaskDefinition).toHaveBeenCalledWith(
        SESSION_ID,
        6861763,
      );
      expect(openmaint.findLookupValues).toHaveBeenCalledWith(
        SESSION_ID,
        'COMMON - Currency',
      );
      expect(item.options).toEqual([
        { id: '267382', label: 'United States Dollar' },
      ]);
    });

    it('consulta una sola vez una lista compartida por varias actividades', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.LOOKUP, 10), rawItem(2, T.LOOKUP, 20)])],
      });
      openmaint.findLookupValues.mockResolvedValue({ data: [] });

      await service.getChecklist(SESSION_ID, PROCESS_ID);

      // Dos definiciones, pero ambas apuntan a COMMON - Currency
      expect(openmaint.findTaskDefinition).toHaveBeenCalledTimes(2);
      expect(openmaint.findLookupValues).toHaveBeenCalledTimes(1);
    });

    it('marca como resuelta una actividad con valor o con ND', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [
          card([
            rawItem(1, T.TEXT, 10, { Outcome: 'ok' }),
            rawItem(2, T.TEXT, 20, { ND: true }),
            rawItem(3, T.TEXT, 30),
          ]),
        ],
      });

      const items = await service.getChecklist(SESSION_ID, PROCESS_ID);

      expect(items.map((item) => item.isResolved)).toEqual([true, true, false]);
    });

    it('devuelve lista vacía si el mantenimiento no tiene checklist', async () => {
      openmaint.findChecklistCard.mockResolvedValue({ data: [] });

      await expect(
        service.getChecklist(SESSION_ID, PROCESS_ID),
      ).resolves.toEqual([]);
    });

    it('no rompe el checklist si falla la carga de opciones', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.LOOKUP, 10)])],
      });
      openmaint.findTaskDefinition.mockRejectedValue(new Error('boom'));

      const [item] = await service.getChecklist(SESSION_ID, PROCESS_ID);

      expect(item.options).toEqual([]);
      expect(item.label).toBe('Actividad 1');
    });
  });

  describe('saveChecklist', () => {
    it('escribe el resultado conservando el resto de claves del registro', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.TEXT, 10)])],
      });

      await service.saveChecklist(SESSION_ID, PROCESS_ID, [
        { taskDefId: 10, value: 'sin novedades' },
      ]);

      const [, cardId, items] = openmaint.updateChecklistCard.mock
        .calls[0] as unknown as [string, number, Record<string, unknown>[]];

      expect(cardId).toBe(CARD_ID);
      expect(items[0]).toMatchObject({
        Outcome: 'sin novedades',
        Modified: true,
        // Claves que OpenMAINT necesita y la app no interpreta
        CI: 4804473,
        Site: 1456213,
        ExecOrder: 1,
        _TaskDef_description: 'Actividad 1',
      });
    });

    it('convierte a número el resultado de las actividades numéricas', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.NUMBER, 10)])],
      });

      await service.saveChecklist(SESSION_ID, PROCESS_ID, [
        { taskDefId: 10, value: '42.5' },
      ]);

      const [, , items] = openmaint.updateChecklistCard.mock
        .calls[0] as unknown as [string, number, Record<string, unknown>[]];

      expect(items[0].Outcome).toBe(42.5);
    });

    it('deja intactas las actividades sin respuesta', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.TEXT, 10), rawItem(2, T.TEXT, 20)])],
      });

      await service.saveChecklist(SESSION_ID, PROCESS_ID, [
        { taskDefId: 10, value: 'hecho' },
      ]);

      const [, , items] = openmaint.updateChecklistCard.mock
        .calls[0] as unknown as [string, number, Record<string, unknown>[]];

      expect(items[1]).toMatchObject({ Outcome: null, Modified: false });
    });
  });

  /** Actividades escritas en el último `updateChecklistCard`. */
  const savedItems = (): Record<string, unknown>[] => {
    const [, , items] = openmaint.updateChecklistCard.mock
      .calls[0] as unknown as [string, number, Record<string, unknown>[]];

    return items;
  };

  describe('markPendingAsNotDone', () => {
    it('marca N.D. solo las actividades sin resultado', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [
          card([
            rawItem(1, T.TEXT, 10, { Outcome: 'sin novedades' }),
            rawItem(2, T.TEXT, 20),
          ]),
        ],
      });

      const changed = await service.markPendingAsNotDone(
        SESSION_ID,
        PROCESS_ID,
      );

      expect(changed).toBe(1);
      expect(savedItems()[0]).toMatchObject({
        Outcome: 'sin novedades',
        ND: false,
      });
      expect(savedItems()[1]).toMatchObject({ ND: true, Modified: true });
    });

    it('conserva las claves que OpenMAINT necesita', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.TEXT, 10)])],
      });

      await service.markPendingAsNotDone(SESSION_ID, PROCESS_ID);

      expect(savedItems()[0]).toMatchObject({
        CI: 4804473,
        Site: 1456213,
        ExecOrder: 1,
        _TaskDef_description: 'Actividad 1',
      });
    });

    it('no escribe si no queda ninguna actividad pendiente', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [
          card([
            rawItem(1, T.TEXT, 10, { Outcome: 'hecho' }),
            rawItem(2, T.TEXT, 20, { ND: true }),
          ]),
        ],
      });

      const changed = await service.markPendingAsNotDone(
        SESSION_ID,
        PROCESS_ID,
      );

      expect(changed).toBe(0);
      expect(openmaint.updateChecklistCard).not.toHaveBeenCalled();
    });

    it('no falla si el mantenimiento no tiene checklist', async () => {
      openmaint.findChecklistCard.mockResolvedValue({ data: [] });

      await expect(
        service.markPendingAsNotDone(SESSION_ID, PROCESS_ID),
      ).resolves.toBe(0);
      expect(openmaint.updateChecklistCard).not.toHaveBeenCalled();
    });
  });

  describe('clearNotDone', () => {
    it('quita el N.D. conservando el resultado ya registrado', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [
          card([
            rawItem(1, T.TEXT, 10, { Outcome: 'sin novedades', ND: true }),
            rawItem(2, T.TEXT, 20, { ND: true }),
          ]),
        ],
      });

      const changed = await service.clearNotDone(SESSION_ID, PROCESS_ID);

      expect(changed).toBe(2);
      expect(savedItems()[0]).toMatchObject({
        Outcome: 'sin novedades',
        ND: false,
      });
      // Vuelve a estar por completar
      expect(savedItems()[1]).toMatchObject({ Outcome: null, ND: false });
    });

    it('no escribe si ninguna actividad está marcada como N.D.', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [card([rawItem(1, T.TEXT, 10, { Outcome: 'hecho' })])],
      });

      const changed = await service.clearNotDone(SESSION_ID, PROCESS_ID);

      expect(changed).toBe(0);
      expect(openmaint.updateChecklistCard).not.toHaveBeenCalled();
    });
  });

  describe('assertComplete', () => {
    it('pasa cuando todas las actividades están resueltas', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [
          card([
            rawItem(1, T.TEXT, 10, { Outcome: 'ok' }),
            rawItem(2, T.TEXT, 20, { ND: true }),
          ]),
        ],
      });

      await expect(
        service.assertComplete(SESSION_ID, PROCESS_ID),
      ).resolves.toBeUndefined();
    });

    it('falla indicando cuántas actividades faltan', async () => {
      openmaint.findChecklistCard.mockResolvedValue({
        data: [
          card([
            rawItem(1, T.TEXT, 10, { Outcome: 'ok' }),
            rawItem(2, T.TEXT, 20),
            rawItem(3, T.TEXT, 30),
          ]),
        ],
      });

      await expect(
        service.assertComplete(SESSION_ID, PROCESS_ID),
      ).rejects.toThrow(/Faltan 2 actividades/);
      await expect(
        service.assertComplete(SESSION_ID, PROCESS_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('no exige nada si el mantenimiento no tiene checklist', async () => {
      openmaint.findChecklistCard.mockResolvedValue({ data: [] });

      await expect(
        service.assertComplete(SESSION_ID, PROCESS_ID),
      ).resolves.toBeUndefined();
    });
  });
});
