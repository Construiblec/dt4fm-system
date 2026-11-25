import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Cada candado retiene una conexión del pool (5), que comparte con el resto de módulos. */
const MAX_HELD = 2;

/** Candado por reserva entre procesos: dos altas simultáneas no crean dos limpiezas. */
@Injectable()
export class CleaningReservationLockService {
  private held = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run<T>(reservationId: string, work: () => Promise<T>): Promise<T> {
    await this.take();
    try {
      // De transacción: el pooler no conserva los candados de sesión.
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(`SET LOCAL lock_timeout = '30s'`);
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `cleaning_reservation:${reservationId}`,
        ]);
        return work();
      });
    } finally {
      this.release();
    }
  }

  private async take(): Promise<void> {
    if (this.held < MAX_HELD) {
      this.held++;
      return;
    }
    // El turno se hereda de quien lo suelta: `held` no cambia.
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.held--;
  }
}
