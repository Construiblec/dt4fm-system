export const mockNotificationsService = {
  notifyIncidentCreated: jest.fn().mockResolvedValue(true),
  notifyIncidentFinished: jest.fn().mockResolvedValue(true),
  notifyMassEmail: jest.fn().mockResolvedValue(true),
};
