import { PushDispatchService } from './push-dispatch.service';

const subscription = { userId: 'u-1' };

describe('PushDispatchService.notifyMaintenancePlanUpdated', () => {
  const repository = {
    findByEmployeeId: jest.fn(),
    saveNotification: jest.fn(),
  };
  const sender = { send: jest.fn() };
  const service = new PushDispatchService(repository as never, sender as never);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findByEmployeeId.mockResolvedValue([subscription]);
  });

  it('avisa al técnico con el tipo y la ubicación del correctivo', async () => {
    await service.notifyMaintenancePlanUpdated({
      kind: 'corrective',
      id: 12,
      employeeId: 7,
      change: 'removed',
      unitName: 'D402 - Depto 402',
      buildingName: 'I - Inglaterra',
    });

    expect(repository.findByEmployeeId).toHaveBeenCalledWith(7);
    expect(repository.saveNotification).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        type: 'maintenance.plan-updated',
        entityKind: 'corrective',
        entityId: '12',
        body: 'Ya no tienes asignado el mantenimiento en Depto 402 · Inglaterra',
      }),
    );
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('en un preventivo usa el activo como ubicación', async () => {
    await service.notifyMaintenancePlanUpdated({
      kind: 'preventive',
      id: 5,
      employeeId: 7,
      change: 'cancelled',
      assetName: 'B1 - Bomba 1',
      buildingName: 'Pradera',
    });

    expect(sender.send).toHaveBeenCalledWith(
      [subscription],
      expect.objectContaining({
        body: 'Se canceló el mantenimiento en Bomba 1 · Pradera',
        entityKind: 'preventive',
      }),
    );
  });

  it('sin dispositivos no guarda ni envía, y un fallo no se propaga', async () => {
    repository.findByEmployeeId.mockResolvedValueOnce([]);
    await service.notifyMaintenancePlanUpdated({
      kind: 'corrective',
      id: 1,
      employeeId: 7,
      change: 'rescheduled',
    });
    expect(sender.send).not.toHaveBeenCalled();

    repository.findByEmployeeId.mockRejectedValueOnce(new Error('bd caída'));
    await expect(
      service.notifyMaintenancePlanUpdated({
        kind: 'corrective',
        id: 1,
        employeeId: 7,
        change: 'rescheduled',
      }),
    ).resolves.toBeUndefined();
  });
});
