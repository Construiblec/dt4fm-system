import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** El guard deja aquí el nombre del cliente de la clave. */
export type CleaningsRequest = Request & { cleaningsClient?: string };

export const CleaningsClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<CleaningsRequest>().cleaningsClient,
);
