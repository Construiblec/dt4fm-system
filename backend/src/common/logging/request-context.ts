import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { safePath } from './describe-error.util';

type RequestContext = {
  /** Id de la petición: sale en cada línea de log y en `X-Request-Id`. */
  rid: string;
  /** Motivo de una respuesta de error, para la línea final de la petición. */
  failure?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Un id que llega de fuera solo se acepta si es corto y sin caracteres raros. */
const INCOMING_RID = /^[A-Za-z0-9._-]{1,64}$/;

/** Render consulta `/health` cada pocos segundos: una línea por consulta es puro ruido. */
const SILENT_PATHS = new Set(['/health']);

const httpLogger = new Logger('HTTP');

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Id de la petición en curso, o `undefined` fuera de una (crons, arranque). */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.rid;
}

/** Deja el motivo del error para que lo muestre la línea de la petición. */
export function recordFailure(reason: string): void {
  const context = storage.getStore();

  if (context) {
    context.failure = reason;
  }
}

/**
 * Patrón de la ruta (`/cleaning-tasks/:id`) y no la URL real: agrupa las
 * peticiones iguales y no deja en el log ids, códigos de enlace ni la query.
 * Sin ruta resuelta (un 404), la URL sin query.
 */
function routeOf(req: Request): string {
  const pattern = (req.route as { path?: unknown } | undefined)?.path;

  return typeof pattern === 'string'
    ? `${req.baseUrl}${pattern}`
    : safePath(req.path);
}

function logRequest(
  req: Request,
  res: Response,
  context: RequestContext,
  startedAt: number,
): void {
  const line =
    `${req.method} ${routeOf(req)} ${res.statusCode} ` +
    `(${Date.now() - startedAt} ms)` +
    (context.failure ? ` ${context.failure}` : '');

  // `finish` llega fuera del contexto de la petición: se vuelve a entrar para
  // que la línea lleve su `rid` como todas las demás.
  storage.run(context, () => {
    if (res.statusCode >= 500) {
      httpLogger.error(line);
    } else if (res.statusCode >= 400) {
      httpLogger.warn(line);
    } else {
      httpLogger.log(line);
    }
  });
}

/**
 * Da a cada petición un id y escribe una sola línea cuando termina. Con ese id
 * se une todo lo que la petición dejó en el log, y como también vuelve en la
 * cabecera `X-Request-Id`, se puede copiar desde DevTools y buscar en Render.
 */
export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header('x-request-id');
  const rid =
    incoming && INCOMING_RID.test(incoming)
      ? incoming
      : randomBytes(4).toString('hex');
  const context: RequestContext = { rid };
  const startedAt = Date.now();

  res.setHeader(REQUEST_ID_HEADER, rid);

  // Los preflight de CORS no son peticiones de la aplicación.
  if (req.method !== 'OPTIONS' && !SILENT_PATHS.has(req.path)) {
    res.on('finish', () => logRequest(req, res, context, startedAt));
  }

  storage.run(context, next);
}
