import { once, withTimeout } from './async.util';

describe('withTimeout', () => {
  afterEach(() => jest.useRealTimers());

  it('devuelve el resultado si llega a tiempo', async () => {
    await expect(
      withTimeout(Promise.resolve('listo'), 1000, () => new Error('tarde')),
    ).resolves.toBe('listo');
  });

  it('rechaza con el error del plazo si se pasa', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(
      new Promise<never>(() => undefined),
      500,
      () => new Error('tarde'),
    );
    const assertion = expect(pending).rejects.toThrow('tarde');

    await jest.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('propaga el fallo del trabajo y no deja el temporizador activo', async () => {
    jest.useFakeTimers();

    await expect(
      withTimeout(
        Promise.reject(new Error('falla')),
        500,
        () => new Error('x'),
      ),
    ).rejects.toThrow('falla');
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('once', () => {
  it('carga una sola vez', async () => {
    const load = jest.fn().mockResolvedValue(7);
    const get = once(load);

    await Promise.all([get(), get()]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
