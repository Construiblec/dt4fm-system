/**
 * Mocks de los 5 providers de OpenmaintModule (aparte de OpenmaintClient,
 * que tiene su propio trap). Cada factory devuelve un objeto FRESCO de
 * jest.fn() — nunca un singleton — para que cada archivo de test tenga sus
 * propias instancias y no arrastre estado entre suites.
 */

export const MOCK_SESSION_ID = 'mock-session-id';

export interface SessionOptions {
  id?: string;
  username?: string;
  userId?: number;
  userDescription?: string | null;
  role?: string;
  availableRoles?: string[];
}

export const mockSession = (opts: SessionOptions = {}) => ({
  _id: opts.id ?? MOCK_SESSION_ID,
  username: opts.username ?? 'tecnico.mock',
  userId: opts.userId ?? 999,
  userDescription: opts.userDescription ?? 'Técnico Mock',
  role: opts.role ?? 'MaintOffice',
  availableRoles: opts.availableRoles ?? ['MaintOffice'],
  multigroup: (opts.availableRoles?.length ?? 1) > 1,
});

// ─── OpenmaintService ───────────────────────────────────────────────────────

export const createOpenmaintServiceMock = () => ({
  // Sesión / identidad
  getSession: jest.fn().mockResolvedValue(mockSession()),
  resolveEmployeeId: jest.fn().mockResolvedValue(4567),
  resolveCleaningEmployeeId: jest.fn().mockResolvedValue(null),
  getEmployees: jest.fn().mockResolvedValue({ data: [] }),
  getEmployeeCard: jest.fn().mockResolvedValue(null),
  findTenantByDescription: jest.fn().mockResolvedValue(null),
  findTenantByIdNumber: jest.fn().mockResolvedValue(null),
  createOwnerUser: jest
    .fn()
    .mockResolvedValue({ success: true, data: { _id: 1 } }),

  // Edificios
  getBuildings: jest.fn().mockResolvedValue({
    data: [{ _id: 100, Code: 'ED-1', Description: 'Edificio Mock' }],
  }),
  getFloorsByBuilding: jest.fn().mockResolvedValue({ data: [] }),
  getUnitsByBuilding: jest.fn().mockResolvedValue({ data: [] }),
  getCommonAreasByBuilding: jest.fn().mockResolvedValue({ data: [] }),

  // Incidencias (CorrectiveMaint, vista de la app técnica)
  createCorrectiveMaintIncident: jest.fn().mockResolvedValue({
    success: true,
    data: { _id: 12345, Id: 12345, id: 12345 },
  }),
  extractIncidentId: jest.fn().mockReturnValue(12345),
  uploadIncidentAttachment: jest.fn().mockResolvedValue(true),
  getIncidentDetail: jest.fn().mockResolvedValue({
    data: {
      _id: 12345,
      Number: 'CM.2026.0150',
      ShortDescr: 'Mock incident location',
      _Site_description: 'Mock Building',
      _ProcessStatus_description: 'Open',
      _Priority_description: 'Alta',
      OpeningDate: new Date().toISOString(),
      Register: '<span data-block="notes">Mock notes</span>',
    },
  }),
  getIncidentAttachments: jest.fn().mockResolvedValue({ data: [] }),
  getAttachmentPreview: jest
    .fn()
    .mockResolvedValue({ data: { hasPreview: false } }),
  getIncidentWithTask: jest.fn().mockResolvedValue({
    data: {
      ExecStartDate: null,
      _ProcessStatus_code: 'CM-Execution',
      _tasklist: [{ _id: 'TASK-123', writable: true }],
    },
  }),
  startIncident: jest.fn().mockResolvedValue(true),
  completeIncident: jest.fn().mockResolvedValue(true),
  uploadCompletionAttachment: jest.fn().mockResolvedValue(true),
  getIncidentsByAssignee: jest.fn().mockResolvedValue({
    data: [
      {
        _id: 12345,
        Number: 'CM.2026.0150',
        ShortDescr: 'Mock location',
        _Priority_description_translation: 'Alta',
        _ProcessStatus_description_translation: 'Open',
        _Site_description: 'Mock Building',
        OpeningDate: new Date().toISOString(),
      },
    ],
  }),
});

export type OpenmaintServiceMock = ReturnType<
  typeof createOpenmaintServiceMock
>;

// ─── OpenmaintAuthService ───────────────────────────────────────────────────

export const createOpenmaintAuthServiceMock = () => ({
  login: jest.fn().mockResolvedValue({ data: mockSession() }),
  setSessionRole: jest.fn().mockResolvedValue({ data: mockSession() }),
  getSession: jest.fn().mockResolvedValue({ data: mockSession() }),
});

export type OpenmaintAuthServiceMock = ReturnType<
  typeof createOpenmaintAuthServiceMock
>;

// ─── OpenmaintRolesService ──────────────────────────────────────────────────

export const createOpenmaintRolesServiceMock = () => ({
  getLabels: jest.fn().mockResolvedValue({ MaintOffice: 'TPM Equipment' }),
});

export type OpenmaintRolesServiceMock = ReturnType<
  typeof createOpenmaintRolesServiceMock
>;

// ─── OpenmaintServiceSession ────────────────────────────────────────────────

export const createOpenmaintServiceSessionMock = () => ({
  get: jest.fn().mockResolvedValue('mock-service-session-id'),
});

export type OpenmaintServiceSessionMock = ReturnType<
  typeof createOpenmaintServiceSessionMock
>;

// ─── OpenmaintUsersService ──────────────────────────────────────────────────

export const createOpenmaintUsersServiceMock = () => ({
  getAccount: jest.fn().mockResolvedValue({
    _id: 999,
    username: 'tecnico.mock',
    description: 'Técnico Mock',
    email: 'tecnico.mock@example.com',
    active: true,
    defaultUserGroup: null,
    userGroups: [{ _id: 1, name: 'MaintOffice' }],
  }),
  updatePassword: jest.fn().mockResolvedValue(undefined),
});

export type OpenmaintUsersServiceMock = ReturnType<
  typeof createOpenmaintUsersServiceMock
>;
