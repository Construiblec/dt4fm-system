import { CleaningsCacheService } from './cleanings-cache.service';

describe('CleaningsCacheService', () => {
  let cache: CleaningsCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new CleaningsCacheService();
  });

  afterEach(() => jest.useRealTimers());

  it('reutiliza durante 30 s y luego vuelve a leer', async () => {
    const load = jest.fn().mockResolvedValue({ n: 1 });

    await cache.getOrLoad('k', load);
    jest.advanceTimersByTime(29_999);
    await cache.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await cache.getOrLoad('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('no comparte estado: alterar lo devuelto o lo leído no cambia la caché', async () => {
    const source = { list: [1] };
    const load = () => Promise.resolve(source);

    const [first, second] = await Promise.all([
      cache.getOrLoad('k', load),
      cache.getOrLoad('k', load),
    ]);
    first.list.push(2);
    source.list.push(3);

    expect(second.list).toEqual([1]);
    expect((await cache.getOrLoad('k', load)).list).toEqual([1]);
  });

  it('une las peticiones simultáneas de la misma clave', async () => {
    let release: (value: number) => void = () => undefined;
    const load = jest.fn(
      () => new Promise<number>((resolve) => (release = resolve)),
    );

    const pending = [1, 2, 3].map(() => cache.getOrLoad('k', load));
    await Promise.resolve();
    release(7);

    expect(await Promise.all(pending)).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['asíncrono', () => Promise.reject(new Error('falla'))],
    [
      'síncrono',
      () => {
        throw new Error('falla');
      },
    ],
  ])(
    'un fallo %s llega a todos y no se guarda',
    async (_case, fail: () => Promise<string>) => {
      const results = await Promise.allSettled([
        cache.getOrLoad('k', fail),
        cache.getOrLoad('k', fail),
      ]);

      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
      expect(await cache.getOrLoad('k', () => Promise.resolve('ok'))).toBe(
        'ok',
      );
    },
  );

  it('guarda como mucho 200 entradas y descarta la más vieja', async () => {
    const load = jest.fn((n: number) => Promise.resolve(n));

    for (let i = 0; i <= 200; i += 1) {
      await cache.getOrLoad(`k${i}`, () => load(i));
    }
    load.mockClear();

    await cache.getOrLoad('k1', () => load(1));
    expect(load).not.toHaveBeenCalled();
    await cache.getOrLoad('k0', () => load(0));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
