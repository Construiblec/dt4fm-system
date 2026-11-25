import { Logger } from '@nestjs/common';
import { HostawaySyncSchedulerService } from './hostaway-sync.scheduler.service';

const result = (over: object = {}) => ({
  dateFrom: '2026-11-25',
  dateTo: '2026-11-26',
  created: 0,
  updated: 0,
  cancelled: 0,
  unchanged: 3,
  skipped: 0,
  failed: 0,
  ...over,
});

const build = (flag: string | undefined, reconcileWindow: jest.Mock) =>
  new HostawaySyncSchedulerService(
    { reconcileWindow } as never,
    { get: () => flag } as never,
  );

describe('HostawaySyncSchedulerService', () => {
  const spies = {} as Record<
    'log' | 'debug' | 'warn' | 'error',
    jest.SpyInstance
  >;

  beforeEach(() => {
    for (const level of ['log', 'debug', 'warn', 'error'] as const) {
      spies[level] = jest.spyOn(Logger.prototype, level).mockImplementation();
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([undefined, 'false', '1', 'TRUE'])(
    'con el flag %j no corre',
    async (flag) => {
      const reconcile = jest.fn();
      await build(flag, reconcile).run();
      expect(reconcile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['debug', {}],
    ['log', { created: 1 }],
    ['log', { cancelled: 1 }],
    ['warn', { created: 1, failed: 1 }],
  ] as const)('registra en %s el resumen de %j', async (level, over) => {
    await build('true', jest.fn().mockResolvedValue(result(over))).run();
    for (const name of ['log', 'debug', 'warn', 'error'] as const) {
      expect(spies[name]).toHaveBeenCalledTimes(name === level ? 1 : 0);
    }
  });

  it('un fallo se registra y no se propaga', async () => {
    const reconcile = jest.fn().mockRejectedValue(new Error('caído'));
    await expect(build('true', reconcile).run()).resolves.toBeUndefined();
    expect(spies.error).toHaveBeenCalledTimes(1);
  });
});
