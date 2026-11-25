export type CleaningSyncAction =
  | 'created'
  | 'updated'
  | 'cancelled'
  | 'unchanged'
  /** No se tocó a propósito: ya empezó, fuera de ventana, estado no concluyente… */
  | 'skipped';

export type CleaningSyncRunResult = {
  dateFrom: string;
  dateTo: string;
  created: number;
  updated: number;
  cancelled: number;
  unchanged: number;
  skipped: number;
  failed: number;
};

export type CleaningSyncStatus = {
  enabled: boolean;
  windowDays: number;
  /** Desde el arranque del proceso; `null` = aún no corrió. */
  lastRunAt: string | null;
  /** Última pasada completa y sin fallos. */
  lastSuccessAt: string | null;
  lastResult: CleaningSyncRunResult | null;
};

export interface CleaningSyncContract {
  reconcileWindow(): Promise<CleaningSyncRunResult>;
  reconcileReservation(reservationId: string): Promise<CleaningSyncAction>;
  /** Señal del webhook: síncrona, nunca lanza y no hace nada con el flag apagado. */
  signal(reservationId: string): void;
  status(): CleaningSyncStatus;
}
