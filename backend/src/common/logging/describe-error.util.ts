import { HttpException } from '@nestjs/common';
import { isAxiosError, type AxiosError } from 'axios';
import { inspect } from 'util';

/** Largo máximo de una causa en el log: una línea que se lee de un vistazo. */
const MAX_LENGTH = 300;

/** Lo que se toma del cuerpo de una respuesta ajena cuando no trae un mensaje conocido. */
const MAX_BODY_LENGTH = 150;

/** Prefijo fijo de la API de openMAINT: está en todas sus rutas y no aporta nada. */
const OPENMAINT_API_PREFIX = /^\/cmdbuild\/services\/rest\/v\d+/;

const SENSITIVE_KEY =
  /pass|token|secret|authori[sz]ation|cookie|session|api[-_]?key/i;

/**
 * `pin` aparte y sin `/i`: como subcadena tapaba `opinion` o `mapping`. Cubre
 * `pin`, `pinCode`, `access_pin`, `plainPin` y `PIN`.
 */
const SENSITIVE_PIN_KEY = /(^|[_-])pin|Pin|PIN/;

const REDACTED = '***';

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || SENSITIVE_PIN_KEY.test(key);
}

/**
 * Copia el valor tapando las claves sensibles, para que un objeto que llegue
 * al log no arrastre contraseñas, sesiones ni PINes. Solo recorre objetos
 * planos y arrays; el resto (clases, Buffer, fechas) se deja como está.
 */
export function redact(value: unknown, depth = 4): unknown {
  if (depth < 0 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth - 1));
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redact(item, depth - 1),
    ]),
  );
}

/**
 * Ruta para el log: sin esquema ni host (la IP del VPS no hace falta), sin el
 * prefijo de la API de openMAINT y sin query. La query lleva filtros JSON
 * codificados que ocupaban cientos de caracteres ilegibles; se deja `?…` para
 * que se sepa que la había.
 *
 * Además tapa el id de `/sessions/{id}`: es la credencial misma, y el cambio
 * de rol la llevaba en la URL (`PUT /sessions/{id}`).
 */
export function safePath(url?: string): string {
  if (!url) {
    return '';
  }

  let path = url.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '');
  const queryStart = path.search(/[?#]/);
  const hadQuery = queryStart >= 0;

  if (hadQuery) {
    path = path.slice(0, queryStart);
  }

  path = path
    .replace(OPENMAINT_API_PREFIX, '')
    .replace(/\/sessions\/(?!current(?:\/|$))[^/]+/g, `/sessions/${REDACTED}`);

  return `${path || '/'}${hadQuery ? '?…' : ''}`;
}

function oneLine(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, ' | ').trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Mensaje de un cuerpo de error ajeno, sin volcarlo entero. */
function upstreamMessage(data: unknown): string {
  if (data === null || data === undefined) {
    return '';
  }

  // `getBuffer` pide `arraybuffer`: un error de openMAINT llega como bytes.
  if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
    const text = Buffer.from(data as ArrayBuffer).toString('utf8');
    return upstreamMessage(text);
  }

  if (typeof data === 'string') {
    const text = data.trim();

    if (text.startsWith('<')) {
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1]?.trim();
      return title
        ? `HTML «${title}»`
        : `respuesta HTML de ${text.length} caracteres`;
    }

    try {
      return upstreamMessage(JSON.parse(text));
    } catch {
      return truncate(oneLine(text), MAX_BODY_LENGTH);
    }
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  if (typeof data !== 'object') {
    return '';
  }

  const body = data as Record<string, unknown>;

  // openMAINT: `{ success: false, messages: [{ level, message }] }`.
  if (Array.isArray(body.messages)) {
    const messages = body.messages as Array<Record<string, unknown>>;
    const relevant =
      messages.find((m) => m?.level === 'ERROR') ?? messages[0] ?? {};
    const text = asString(relevant.message);
    if (text) return text;
  }

  // Hostaway (OAuth y API).
  const hostaway = asString(body.error_description);
  if (hostaway) return hostaway;

  // VPS de accesos: `{ code, message }`.
  const code = asString(body.code);
  const message = asString(body.message) ?? asString(body.error);
  if (code && message) return `${code}: ${message}`;
  if (message) return message;
  if (code) return code;

  return truncate(JSON.stringify(redact(body)) ?? '', MAX_BODY_LENGTH);
}

function describeHttpError(error: AxiosError): string {
  const method = error.config?.method?.toUpperCase() ?? 'HTTP';
  const path = safePath(error.config?.url);
  const status = error.response?.status;
  const upstream = upstreamMessage(error.response?.data);
  const externalId = asString(error.response?.headers?.['x-request-id']);

  // Sin respuesta (caído, timeout, DNS) el código y el mensaje son la causa.
  const outcome = status
    ? String(status)
    : [error.code, error.message].filter(Boolean).join(': ') || 'sin respuesta';

  return [
    `${method} ${path} → ${outcome}`,
    upstream ? `: ${upstream}` : '',
    externalId ? ` (id externo ${externalId})` : '',
  ].join('');
}

function describeGenericError(error: Error): string {
  if (error instanceof HttpException) {
    return error.message;
  }

  // `QueryFailedError` de TypeORM y los errores de `pg` traen el SQLSTATE.
  const code =
    asString((error as { code?: unknown }).code) ??
    asString((error as { driverError?: { code?: unknown } }).driverError?.code);

  const text = `${error.name}: ${error.message}${code ? ` (${code})` : ''}`;
  const cause = (error as { cause?: unknown }).cause;

  return cause ? `${text} ← causa: ${describeError(cause)}` : text;
}

/**
 * Una línea con la causa de cualquier error, sin secretos.
 *
 * Existe porque un `AxiosError` pasado tal cual al logger se imprimía con su
 * `config` (cabeceras con la sesión de openMAINT y el cuerpo, con la contraseña
 * de la cuenta de servicio en el login) y su `request` (el socket entero):
 * **567 líneas** por un solo fallo. Sigue el formato que ya usaban
 * `HostawayService` y `AccessIotClient`: estado, código y mensaje del servicio.
 */
export function describeError(error: unknown): string {
  let text: string;

  if (isAxiosError(error)) {
    text = describeHttpError(error);
  } else if (error instanceof Error) {
    text = describeGenericError(error);
  } else if (typeof error === 'string') {
    text = error;
  } else {
    text = inspect(redact(error), {
      depth: 2,
      compact: true,
      breakLength: Infinity,
    });
  }

  return truncate(oneLine(text), MAX_LENGTH);
}
