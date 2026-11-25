import {
  ArgumentMetadata,
  BadRequestException,
  Type,
  ValidationPipe,
} from '@nestjs/common';

// Cuerpo → lista → elemento → valor simple.
const MAX_DEPTH = 3;

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

// Nest y class-transformer descartan estas claves en silencio; aquí son un 400.
const isReserved = (key: string) =>
  key === 'prototype' || key in Object.prototype;

const isAcceptable = (value: unknown, depth: number): boolean =>
  !isObject(value) ||
  (depth > 0 &&
    Object.entries(value).every(
      ([key, child]) => !isReserved(key) && isAcceptable(child, depth - 1),
    ));

class StrictBodyPipe extends ValidationPipe {
  async transform(value: unknown, metadata: ArgumentMetadata) {
    if (!isObject(value) || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo debe ser un objeto JSON');
    }

    if (!isAcceptable(value, MAX_DEPTH)) {
      throw new BadRequestException('El cuerpo tiene campos no admitidos');
    }

    return (await super.transform(value, metadata)) as unknown;
  }
}

/** Como `strictQuery`: el argumento se tipa como `Record` y el DTO va aquí. */
export const strictBody = (expectedType: Type<unknown>) =>
  new StrictBodyPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    expectedType,
  });
