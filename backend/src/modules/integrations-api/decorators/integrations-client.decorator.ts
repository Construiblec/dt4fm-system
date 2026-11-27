import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** El guard deja aquí el nombre del cliente de la clave. */
export type IntegrationsRequest = Request & { integrationsClient?: string };

export const IntegrationsClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<IntegrationsRequest>().integrationsClient,
);
