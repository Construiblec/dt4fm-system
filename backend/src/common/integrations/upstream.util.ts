/** Un listado sin `data` es un fallo de la fuente, no un listado vacío. */
export const requireList = <T>(
  response: { data?: T[] } | null | undefined,
): T[] => {
  if (!Array.isArray(response?.data)) {
    throw new Error('la fuente respondió sin listado');
  }
  return response.data;
};

/** Los lookups sin descripción llegan como id interno: no se exponen. */
export const labelOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value && !/^\d+$/.test(value) ? value : null;

export const upstreamStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

/** Una página HTML es de un proxy caído, no la respuesta de la fuente. */
export const isHtml = (error: unknown): boolean => {
  const body = (error as { response?: { data?: unknown } } | null)?.response
    ?.data;
  return typeof body === 'string' && body.trimStart().startsWith('<');
};
