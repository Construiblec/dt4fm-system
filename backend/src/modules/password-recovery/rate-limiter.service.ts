import { Injectable } from '@nestjs/common';

type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * Limitador de peticiones en memoria.
 *
 * Deliberadamente simple: sin dependencias nuevas y suficiente para el único
 * endpoint público que dispara correos. Al vivir en memoria, el conteo se
 * reinicia cuando Render reinicia la instancia y no se comparte si algún día
 * hay varias réplicas. Para frenar abuso casual y proteger la cuota de envío
 * alcanza; si el servicio llega a escalar, este es el único punto a cambiar
 * (por ejemplo, moviendo los contadores a Redis).
 */
@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Registra un intento. Devuelve `true` si está permitido y `false` si la
   * clave ya superó el límite dentro de la ventana.
   */
  hit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.evictExpired(now);

    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (bucket.count >= limit) {
      return false;
    }

    bucket.count += 1;
    return true;
  }

  /** Evita que el mapa crezca sin control en un proceso de larga vida. */
  private evictExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
