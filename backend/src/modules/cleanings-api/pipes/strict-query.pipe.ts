import { Type, ValidationPipe } from '@nestjs/common';

/**
 * El pipe global corre antes y descartaría los parámetros desconocidos: el
 * argumento se tipa como `Record` y el DTO real se indica en `expectedType`.
 */
export const strictQuery = (expectedType: Type<unknown>) =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    expectedType,
  });
