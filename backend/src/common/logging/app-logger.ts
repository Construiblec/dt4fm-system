import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { describeError, redact } from './describe-error.util';
import { currentRequestId } from './request-context';

/** De más grave a menos: `LOG_LEVEL=warn` deja pasar fatal, error y warn. */
const LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

const DEFAULT_LEVEL: LogLevel = 'log';

/**
 * Contextos con los que Nest anuncia cada módulo, controlador y ruta al
 * arrancar: unas 190 líneas por despliegue que no dicen nada nuevo. Solo se
 * muestran con `LOG_LEVEL=debug`.
 */
const BOOT_CONTEXTS = new Set([
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
]);

/** Líneas de traza que se conservan: las de nuestro código, no las de librerías. */
const MAX_STACK_FRAMES = 5;

export function resolveLogLevels(value: string | undefined): LogLevel[] {
  const wanted = value?.trim().toLowerCase() as LogLevel | undefined;
  const index = LEVELS.indexOf(wanted ?? DEFAULT_LEVEL);

  return LEVELS.slice(
    0,
    (index >= 0 ? index : LEVELS.indexOf(DEFAULT_LEVEL)) + 1,
  );
}

/** Hasta cinco marcos de la traza que sean de nuestro código, no de librerías. */
function ownFrames(stack: string): string[] {
  return stack
    .split('\n')
    .slice(1)
    .filter((line) => /^\s+at /.test(line))
    .filter((line) => !/node_modules|node:internal|\(node:/.test(line))
    .slice(0, MAX_STACK_FRAMES);
}

/** Primera línea de la traza y hasta cinco marcos propios. */
export function trimStack(stack: string): string {
  return [stack.split('\n')[0], ...ownFrames(stack)].join('\n');
}

/**
 * Logger de toda la aplicación (`main.ts`). Cada evento ocupa una línea, sin
 * secretos y con el `rid` de la petición que lo causó.
 *
 * La limpieza va aquí y no en cada llamada porque los volcados venían de tres
 * sitios que no controlamos uno a uno: el manejador de errores de Nest
 * (`logger.error(exception)`), `@nestjs/schedule` (`logger.error(error)`) y
 * nuestras propias llamadas `logger.error(mensaje, error)`.
 *
 * Variables de entorno:
 *   LOG_LEVEL   error | warn | log | debug | verbose (defecto `log`)
 *   LOG_FORMAT  `json` para una línea JSON por evento (defecto texto)
 */
export class AppLogger extends ConsoleLogger {
  constructor() {
    const json = process.env.LOG_FORMAT?.trim().toLowerCase() === 'json';

    super({
      logLevels: resolveLogLevels(process.env.LOG_LEVEL),
      json,
      // Render no es una terminal: sin TTY los colores llegan como `[32m`.
      colors: !json && Boolean(process.stdout.isTTY),
      // Red de seguridad: si algún objeto llega igual, sale en una sola línea
      // y recortado, en vez de cientos de líneas.
      compact: true,
      breakLength: Infinity,
      depth: 3,
      maxStringLength: 500,
      maxArrayLength: 20,
    });
  }

  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    if (BOOT_CONTEXTS.has(context) && !this.isLevelEnabled('debug')) {
      return;
    }

    const clean = messages.map((message) => this.sanitize(message));
    const rid = currentRequestId();

    // `logger.error('No se pudo X', error)` son dos mensajes: Nest los
    // imprimía en líneas separadas. Si todos son texto, van en una.
    const printable = clean.every((message) => typeof message === 'string')
      ? [clean.join(' — ')]
      : clean;

    const withRid =
      rid && !this.options.json
        ? printable.map((message) =>
            typeof message === 'string' ? `${message} rid=${rid}` : message,
          )
        : printable;

    super.printMessages(
      withRid,
      context,
      logLevel,
      writeStreamType,
      errorStack,
    );
  }

  protected getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
    },
  ) {
    const rid = currentRequestId();
    const logObject = super.getJsonLogObject(message, {
      ...options,
      errorStack:
        typeof options.errorStack === 'string'
          ? trimStack(options.errorStack)
          : options.errorStack,
    });

    return rid ? { ...logObject, rid } : logObject;
  }

  protected printStackTrace(stack: string): void {
    if (typeof stack !== 'string' || !stack) {
      return;
    }

    // Solo los marcos: la primera línea de la traza repite el error, que ya va
    // en la línea del mensaje. Sin marcos propios (un error de axios solo tiene
    // marcos de librería) no se escribe nada más.
    const frames = ownFrames(stack);

    if (frames.length > 0) {
      super.printStackTrace(frames.join('\n'));
    }
  }

  private sanitize(message: unknown): unknown {
    if (message instanceof Error) {
      return describeError(message);
    }

    if (typeof message === 'string') {
      // Una línea por evento: los saltos parten la entrada en Render y se
      // mezclan con las de otras peticiones.
      return message.replace(/\s*\r?\n\s*/g, ' | ');
    }

    return redact(message);
  }
}
