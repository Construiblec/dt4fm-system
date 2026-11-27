import { ReadLimiter } from './read-limiter';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};

describe('ReadLimiter', () => {
  it('no pasa del tope y atiende las esperas al liberarse un hueco', async () => {
    const limiter = new ReadLimiter(2);
    const gates = [deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;
    const read = (i: number) => () => {
      running++;
      peak = Math.max(peak, running);
      return gates[i].promise.finally(() => running--);
    };

    const all = Promise.all([0, 1, 2].map((i) => limiter.run(read(i))));
    await new Promise((resolve) => setImmediate(resolve));
    expect(running).toBe(2);

    gates[0].resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(running).toBe(2);

    gates[1].resolve();
    gates[2].resolve();
    await all;
    expect(peak).toBe(2);
  });

  it('al cerrarse rechaza a quien espera y a lo nuevo', async () => {
    const limiter = new ReadLimiter(1);
    const gate = deferred();
    const first = limiter.run(() => gate.promise);
    const waiting = limiter.run(() => Promise.resolve('nunca'));

    limiter.close();

    await expect(waiting).rejects.toThrow('la lectura ya terminó');
    await expect(limiter.run(() => Promise.resolve(1))).rejects.toThrow(
      'la lectura ya terminó',
    );
    gate.resolve();
    await expect(first).resolves.toBeUndefined();
  });

  it('libera el hueco aunque la lectura falle', async () => {
    const limiter = new ReadLimiter(1);

    await expect(
      limiter.run(() => Promise.reject(new Error('falla'))),
    ).rejects.toThrow('falla');
    await expect(limiter.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});
