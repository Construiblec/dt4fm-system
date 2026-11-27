/** Tope de lecturas a la vez; al cerrarse no empieza ninguna más. */
export class ReadLimiter {
  private active = 0;
  private closed = false;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  async run<T>(read: () => Promise<T>): Promise<T> {
    while (!this.closed && this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    if (this.closed) throw new Error('la lectura ya terminó');
    this.active++;
    try {
      return await read();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  close(): void {
    this.closed = true;
    this.waiting.splice(0).forEach((resume) => resume());
  }
}
