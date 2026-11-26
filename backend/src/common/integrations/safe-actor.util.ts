/** El nombre del cliente va al log: una línea y sin caracteres raros. */
export const safeActor = (actor: string): string =>
  String(actor ?? '')
    .replace(/[^\p{L}\p{N} ._@-]/gu, '')
    .trim()
    .slice(0, 64) || 'desconocido';
