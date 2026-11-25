import { InternalServerErrorException } from '@nestjs/common';
import { CleaningTasksService } from './cleaning-tasks.service';

const DTO = {
  hostawayReservationId: 'R1',
  listingName: 'R315',
  listingId: '412101',
  checkoutDate: '2026-11-26',
  checkoutTime: '11:00',
  guestName: 'x',
};

const wrapped = (cause: Record<string, unknown>) =>
  new InternalServerErrorException('x', {
    cause: Object.assign(new Error('x'), { isAxiosError: true, ...cause }),
  });

describe('CleaningTasksService.createCleaningTask', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const build = () => {
    const gateway = {
      taskExistsByReservationId: jest.fn().mockResolvedValue(false),
      findTasksByReservation: jest.fn().mockResolvedValue([]),
      createCleaningTask: jest
        .fn()
        .mockResolvedValue({ data: { _id: 10, TaskNumber: 'CT.1' } }),
    };
    const lock = {
      run: jest.fn((_id: string, work: () => Promise<unknown>) => work()),
    };
    const unused = {} as never;
    const service = new CleaningTasksService(
      unused,
      gateway as never,
      unused,
      unused,
      unused,
      lock as never,
    );
    return { service, gateway, lock };
  };

  it('vuelve a mirar con el candado tomado: si otra la creó, no duplica', async () => {
    const { service, gateway } = build();
    gateway.taskExistsByReservationId
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(service.createCleaningTask(DTO)).resolves.toMatchObject({
      created: false,
    });
    expect(gateway.createCleaningTask).not.toHaveBeenCalled();
  });

  it('si ya existe no toma el candado', async () => {
    const { service, gateway, lock } = build();
    gateway.taskExistsByReservationId.mockResolvedValue(true);
    await service.createCleaningTask(DTO);
    expect(lock.run).not.toHaveBeenCalled();
  });

  it('si no se puede comprobar, no crea', async () => {
    const { service, gateway } = build();
    gateway.taskExistsByReservationId.mockRejectedValue(new Error('caída'));
    await expect(service.createCleaningTask(DTO)).rejects.toThrow('caída');
    expect(gateway.createCleaningTask).not.toHaveBeenCalled();
  });

  it('las ignoradas no cuentan como existentes', async () => {
    const { service, gateway } = build();
    gateway.findTasksByReservation.mockResolvedValue([{ _id: 5 }]);
    await expect(service.createCleaningTask(DTO, [5])).resolves.toMatchObject({
      created: true,
      taskId: 10,
    });
    await expect(service.createCleaningTask(DTO, [6])).resolves.toMatchObject({
      created: false,
    });
  });

  it('sin respuesta pero creada: la da por creada', async () => {
    const { service, gateway } = build();
    gateway.createCleaningTask.mockRejectedValue(wrapped({}));
    gateway.taskExistsByReservationId
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const result = service.createCleaningTask(DTO);
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toMatchObject({
      created: true,
      taskId: null,
    });
  });

  it('un rechazo con respuesta falla sin esperar', async () => {
    const { service, gateway } = build();
    gateway.createCleaningTask.mockRejectedValue(
      wrapped({ response: { status: 500 } }),
    );
    await expect(service.createCleaningTask(DTO)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(gateway.taskExistsByReservationId).toHaveBeenCalledTimes(2);
  });
});
