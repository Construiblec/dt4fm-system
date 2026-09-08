/**
 * Mocks de los gateways HTTP propios de cada módulo (todos hablan con
 * openMAINT directo vía OpenmaintClient, o con un tercero — Contifico,
 * Hostaway). Factories frescas por archivo, mismo criterio que
 * openmaint-core.mock.ts.
 */

// ─── CleaningTasksOpenmaintService ──────────────────────────────────────────

export const createCleaningTasksOpenmaintServiceMock = () => ({
  getCleaningTasks: jest.fn().mockResolvedValue({ data: [] }),
  createCleaningTask: jest.fn().mockResolvedValue({ data: { _id: 777 } }),
  updateCleaningTask: jest.fn().mockResolvedValue({ data: { _id: 777 } }),
  getTasksByEmployee: jest.fn().mockResolvedValue({ data: [] }),
  getTaskById: jest.fn(),
  getTaskByIdWithSession: jest.fn(),
  getCleaningActivity: jest.fn().mockResolvedValue(null),
  getUnitById: jest.fn().mockResolvedValue(null),
  updateTaskWithSession: jest.fn().mockResolvedValue({ data: { _id: 777 } }),
  getAttachments: jest.fn().mockResolvedValue({ data: [] }),
  deleteAttachment: jest.fn().mockResolvedValue(true),
  uploadAttachment: jest.fn().mockResolvedValue(true),
  getAllTasks: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  downloadAttachment: jest.fn().mockResolvedValue({
    data: Buffer.from('mock'),
    contentType: 'image/png',
    fileName: 'mock.png',
  }),
  taskExistsByReservationId: jest.fn().mockResolvedValue(false),
});

export type CleaningTasksOpenmaintServiceMock = ReturnType<
  typeof createCleaningTasksOpenmaintServiceMock
>;

// ─── PreventiveMaintenanceOpenmaintService ──────────────────────────────────
// Ojo: esta misma clase se inyecta también en MaintenanceSupervisionModule
// como provider propio (instancia separada en tiempo de ejecución real, pero
// overrideProvider() en el testing module reemplaza el token en TODO el
// árbol compilado, así que un solo mock cubre ambos módulos).

export const createPreventiveMaintenanceOpenmaintServiceMock = () => ({
  findByAssignee: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  findAll: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  count: jest.fn().mockResolvedValue(0),
  findByEquipment: jest.fn().mockResolvedValue({ data: [] }),
  findById: jest.fn(),
  findWithTasklist: jest.fn(),
  advance: jest.fn().mockResolvedValue({ data: {} }),
  saveFields: jest.fn().mockResolvedValue({ data: {} }),
  findAttachments: jest.fn().mockResolvedValue({ data: [] }),
  findAttachmentPreview: jest
    .fn()
    .mockResolvedValue({ data: { hasPreview: false } }),
  downloadAttachment: jest.fn().mockResolvedValue({
    data: Buffer.from('mock'),
    contentType: 'application/pdf',
    fileName: 'mock.pdf',
  }),
  deleteAttachment: jest.fn().mockResolvedValue(true),
  uploadAttachment: jest.fn().mockResolvedValue(true),
  findMaintenanceConfig: jest.fn().mockResolvedValue(null),
  findManualAttachments: jest.fn().mockResolvedValue({ data: [] }),
  downloadManualAttachment: jest.fn().mockResolvedValue({
    data: Buffer.from('mock'),
    contentType: 'application/pdf',
    fileName: 'manual.pdf',
  }),
  findChecklistCard: jest.fn().mockResolvedValue({ data: [] }),
  updateChecklistCard: jest.fn().mockResolvedValue({ data: {} }),
  findTaskDefinition: jest.fn().mockResolvedValue({ data: {} }),
  findLookupValues: jest.fn().mockResolvedValue({
    data: [{ _id: 266683, description: 'Falta de repuesto', active: true }],
  }),
});

export type PreventiveMaintenanceOpenmaintServiceMock = ReturnType<
  typeof createPreventiveMaintenanceOpenmaintServiceMock
>;

// ─── CorrectiveMaintOpenmaintService ────────────────────────────────────────

export const createCorrectiveMaintOpenmaintServiceMock = () => ({
  findAll: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
  count: jest.fn().mockResolvedValue(0),
  findById: jest.fn(),
  findWithTasklist: jest.fn(),
  advance: jest.fn().mockResolvedValue({ data: {} }),
  saveFields: jest.fn().mockResolvedValue({ data: {} }),
});

export type CorrectiveMaintOpenmaintServiceMock = ReturnType<
  typeof createCorrectiveMaintOpenmaintServiceMock
>;

// ─── IotAlarmOpenmaintService ───────────────────────────────────────────────

export const createIotAlarmOpenmaintServiceMock = () => ({
  findAssetByCode: jest.fn().mockResolvedValue({
    outcome: 'found',
    asset: { _id: 3209930, Building: 3019998 },
  }),
  createCorrective: jest.fn().mockResolvedValue({
    id: 8192982,
    number: 'CM.2026.0150',
  }),
});

export type IotAlarmOpenmaintServiceMock = ReturnType<
  typeof createIotAlarmOpenmaintServiceMock
>;

// ─── PasswordRecoveryOpenmaintService ───────────────────────────────────────

export const createPasswordRecoveryOpenmaintServiceMock = () => ({
  getServiceSessionId: jest.fn().mockResolvedValue('mock-service-session-id'),
  findUsers: jest.fn().mockResolvedValue([]),
  getUserCard: jest.fn().mockResolvedValue(null),
  getUserAccount: jest.fn().mockResolvedValue(null),
  updatePassword: jest.fn().mockResolvedValue(undefined),
});

export type PasswordRecoveryOpenmaintServiceMock = ReturnType<
  typeof createPasswordRecoveryOpenmaintServiceMock
>;

// ─── PaymentsOpenmaintRepository ────────────────────────────────────────────

export const createPaymentsOpenmaintRepositoryMock = () => ({
  getSession: jest.fn().mockResolvedValue('mock-service-session-id'),
  getConfigExpensa: jest.fn().mockResolvedValue(null),
  getTenants: jest.fn().mockResolvedValue([]),
  getTenantsEmailMap: jest.fn().mockResolvedValue(new Map()),
  getPagosDelPeriodo: jest.fn().mockResolvedValue([]),
  getPendingPayments: jest.fn().mockResolvedValue([]),
  createPaymentCard: jest
    .fn()
    .mockResolvedValue({ success: true, data: { _id: 1 } }),
});

export type PaymentsOpenmaintRepositoryMock = ReturnType<
  typeof createPaymentsOpenmaintRepositoryMock
>;

// ─── AccessIotGateway ───────────────────────────────────────────────────────
// La VPS central de accesos todavía no existe; en producción el módulo resuelve
// a AccessIotMockGateway con ACCESS_IOT_USE_MOCK. Aquí se sustituye por un
// doble de jest para poder forzar `partial`, `unreachable` y `pin_conflict`,
// que el mock en memoria solo produce en escenarios muy concretos.
//
// El catálogo por defecto cubre Inglaterra y Pradera y NO Batán ni Republica,
// que es lo que hace que un edificio sin cobertura sea un caso probable.

export const ING_BUILDING_ID = 3025058;
export const PRA_BUILDING_ID = 3019998;
export const BAT_BUILDING_ID = 3025059;

export const createAccessIotGatewayMock = () => ({
  listBuildings: jest.fn().mockResolvedValue([
    {
      buildingId: ING_BUILDING_ID,
      code: 'ING',
      name: 'Inglaterra',
      online: true,
      scopes: ['pedestrian', 'vehicular'],
    },
    {
      buildingId: PRA_BUILDING_ID,
      code: 'PRA',
      name: 'Pradera',
      online: true,
      scopes: ['pedestrian', 'vehicular'],
    },
  ]),
  listDevices: jest.fn().mockResolvedValue([]),
  putCredential: jest.fn().mockImplementation((credentialId: string) =>
    Promise.resolve({
      credentialId,
      state: 'written',
      devices: [
        {
          deviceId: 'ING-PEATONAL-1',
          state: 'written',
          employeeNo: 'DT4-T-abcdef01',
        },
      ],
    }),
  ),
  deleteCredential: jest
    .fn()
    .mockImplementation((credentialId: string) =>
      Promise.resolve({ credentialId, state: 'written', devices: [] }),
    ),
  getCredential: jest.fn().mockResolvedValue(null),
  getHealth: jest.fn().mockResolvedValue({ buildings: [] }),
  getDeviceInventory: jest
    .fn()
    .mockResolvedValue({ users: [], nextCursor: null }),
});

export type AccessIotGatewayMock = ReturnType<
  typeof createAccessIotGatewayMock
>;

// ─── UnitResolverService ────────────────────────────────────────────────────
// Vive en integrations/openmaint pero inyecta OpenmaintClient directo, así que
// sin este doble caería en el trap.

export const createUnitResolverServiceMock = () => ({
  byListingId: jest.fn().mockResolvedValue(null),
  forget: jest.fn(),
});

export type UnitResolverServiceMock = ReturnType<
  typeof createUnitResolverServiceMock
>;
