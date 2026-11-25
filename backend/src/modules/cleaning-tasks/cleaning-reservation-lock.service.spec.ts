import { CleaningReservationLockService } from './cleaning-reservation-lock.service';

describe('CleaningReservationLockService', () => {
  const build = () => {
    const query = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn((work: (manager: unknown) => unknown) =>
      Promise.resolve(work({ query })),
    );
    const service = new CleaningReservationLockService({
      transaction,
    } as never);
    return { service, query, transaction };
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));

  it('toma el candado de la reserva antes de trabajar', async () => {
    const { service, query } = build();
    const work = jest.fn().mockResolvedValue('ok');
    await expect(service.run('R1', work)).resolves.toBe('ok');
    expect(query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['cleaning_reservation:R1'],
    );
    expect(work.mock.invocationCallOrder[0]).toBeGreaterThan(
      query.mock.invocationCallOrder[1],
    );
  });

  it('retiene como mucho dos conexiones y atiende a todos, también tras un error', async () => {
    const { service, transaction } = build();
    const finish: Array<(ok: boolean) => void> = [];
    const work = () =>
      new Promise<void>((resolve, reject) =>
        finish.push((ok) => (ok ? resolve() : reject(new Error('x')))),
      );
    const runs = ['a', 'b', 'c', 'd'].map((id) => service.run(id, work));
    const settled = Promise.allSettled(runs);

    await tick();
    expect(transaction).toHaveBeenCalledTimes(2);
    finish[0](false);
    await tick();
    expect(transaction).toHaveBeenCalledTimes(3);
    finish[1](true);
    await tick();
    expect(transaction).toHaveBeenCalledTimes(4);
    finish[2](true);
    finish[3](true);
    expect((await settled).map((r) => r.status)).toEqual([
      'rejected',
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
  });
});
