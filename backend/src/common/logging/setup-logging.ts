import type { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { requestContext } from './request-context';

/**
 * El `rid` por petición y el filtro de errores. Vive aquí y no en `main.ts`
 * para que las E2E (`test/helpers/test-app.ts`) prueben lo mismo que corre en
 * Render. Va antes que CORS y que las rutas: así hasta un preflight lleva su
 * `X-Request-Id`.
 */
export function setupLogging(app: INestApplication): void {
  app.use(requestContext);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));
}
