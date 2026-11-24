import { Injectable } from '@nestjs/common';

const TTL_MS = 30 * 1000;
const MAX_ENTRIES = 200;

type Entry = { value: unknown; expiresAt: number };

/** Caché breve de lecturas correctas; las peticiones simultáneas comparten una sola. */
@Injectable()
export class CleaningsCacheService {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    const value =
      cached && cached.expiresAt > Date.now()
        ? cached.value
        : await (this.inFlight.get(key) ?? this.start(key, load));

    // Copia por petición: nadie comparte ni altera lo guardado.
    return structuredClone(value) as T;
  }

  private start(key: string, load: () => Promise<unknown>): Promise<unknown> {
    const pending = Promise.resolve()
      .then(load)
      .then((value) => {
        const copy = structuredClone(value);
        this.store(key, copy);
        return copy;
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, pending);

    return pending;
  }

  // El orden de inserción es el de vencimiento: la primera es siempre la más vieja.
  private store(key: string, value: unknown): void {
    this.entries.delete(key);

    if (this.entries.size >= MAX_ENTRIES) {
      const [oldest] = this.entries.keys();
      this.entries.delete(oldest);
    }

    this.entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }
}
