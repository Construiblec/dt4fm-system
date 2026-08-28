import { ValidationPipeOptions } from '@nestjs/common';

/**
 * Config del ValidationPipe global. Vive aparte de main.ts para que las
 * suites E2E puedan aplicar exactamente la misma validación que producción
 * en vez de montar la app "pelada" (que fue lo que hizo que la suite de
 * incidents.e2e-spec.ts nunca disparara los 400 de class-validator).
 */
export const validationPipeOptions: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
};
