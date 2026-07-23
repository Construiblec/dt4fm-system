export const mockOpenmaintService = {
  createCorrectiveMaintIncident: jest.fn().mockResolvedValue({
    success: true,
    data: { _id: 12345, Id: 12345, id: 12345 },
  }),
  uploadIncidentAttachment: jest.fn().mockResolvedValue(true),
  extractIncidentId: jest.fn().mockReturnValue(12345),
  getIncidentDetail: jest.fn().mockResolvedValue({
    data: {
      _id: 12345,
      Number: 'INC-12345',
      ShortDescr: 'Mock incident location',
      _Site_description: 'Mock Building',
      _ProcessStatus_description: 'Open',
      _Priority_description: 'Alta',
      OpeningDate: new Date().toISOString(),
      Register: '<span data-block="notes">Mock notes</span>',
    },
  }),
  getIncidentAttachments: jest.fn().mockResolvedValue({ data: [] }),
  getAttachmentPreview: jest.fn().mockResolvedValue({ data: { hasPreview: false } }),
  getIncidentWithTask: jest.fn().mockResolvedValue({
    data: {
      _tasklist: [{ _id: 'TASK-123', writable: true }],
    },
  }),
  completeIncident: jest.fn().mockResolvedValue(true),
  uploadCompletionAttachment: jest.fn().mockResolvedValue(true),
  getIncidentsByRequester: jest.fn().mockResolvedValue({
    data: [
      {
        _id: 12345,
        Number: 'INC-12345',
        ShortDescr: 'Mock location',
        _Priority_description_translation: 'Alta',
        _ProcessStatus_description_translation: 'Open',
        _Site_description: 'Mock Building',
        OpeningDate: new Date().toISOString(),
      },
    ],
  }),
};
