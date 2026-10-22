import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  IntrinsicException,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { describeError } from '../logging/describe-error.util';
import { recordFailure } from '../logging/request-context';

/** El cuerpo que Nest responde a un error que no es `HttpException`. */
const UNKNOWN_ERROR_MESSAGE = 'Internal server error';

/** Motivo legible de una `HttpException`, incluidos los arrays de validación. */
function reasonOf(exception: HttpException): string {
  const response = exception.getResponse();
  const message =
    typeof response === 'object' && response !== null
      ? (response as { message?: unknown }).message
      : response;

  if (Array.isArray(message)) {
    return message.join('; ');
  }

  return typeof message === 'string' ? message : exception.message;
}

/**
 * Lo mismo que respondería Nest a un error desconocido, como `HttpException`
 * para que `BaseExceptionFilter` lo devuelva sin registrarlo otra vez.
 *
 * Errores con `statusCode` y `message` (los de body-parser, por ejemplo un 413)
 * conservan su estado, como hace `handleUnknownError`.
 */
function asHttpException(exception: unknown): HttpException {
  const candidate = exception as { statusCode?: unknown; message?: unknown };

  if (
    typeof candidate?.statusCode === 'number' &&
    typeof candidate?.message === 'string' &&
    candidate.message
  ) {
    return new HttpException(
      { statusCode: candidate.statusCode, message: candidate.message },
      candidate.statusCode,
    );
  }

  return new HttpException(
    {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: UNKNOWN_ERROR_MESSAGE,
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

/**
 * Sustituye el registro del manejador de errores de Nest, que hacía
 * `logger.error(exception)`: con un `AxiosError` eso eran 567 líneas con la
 * sesión y la contraseña de openMAINT dentro.
 *
 * - Error desconocido: una línea con la causa y unos pocos marcos de traza
 *   propios (los recorta `AppLogger`). La respuesta no cambia.
 * - `HttpException`: no se registra aquí. Su motivo pasa a la línea de la
 *   petición, de modo que un 500 o un 502 ya no queda en silencio.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    if (exception instanceof HttpException) {
      recordFailure(reasonOf(exception));
      super.catch(exception, host);
      return;
    }

    // Nest no registra las suyas a propósito; se respeta.
    if (exception instanceof IntrinsicException) {
      super.catch(exception, host);
      return;
    }

    const reason = describeError(exception);
    recordFailure(reason);
    this.logger.error(
      reason,
      exception instanceof Error ? exception.stack : undefined,
    );

    super.catch(asHttpException(exception), host);
  }
}
