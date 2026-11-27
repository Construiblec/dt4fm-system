import { applyDecorators, StreamableFile } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import {
  attachmentDisposition,
  safeContentType,
} from '../integrations-api/utils/download-headers.util';
import type { MaintenanceReadFile } from '../maintenance-supervision/maintenance-integration.types';

export type ListMeta = {
  total: number | null;
  limit: number;
  offset: number;
  nextOffset: number | null;
};

// En UTC, para que el mismo instante escrito con otro offset comparta caché.
const toUtc = (value: string) => new Date(value).toISOString();

/** Los rangos (`...From`/`...To`) pasan a UTC; el resto queda igual. */
export const normalizeInstants = <T extends object>(filters: T): T =>
  Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [
      key,
      /(From|To)$/.test(key) && typeof value === 'string'
        ? toUtc(value)
        : value,
    ]),
  ) as T;

export const toMeta = (
  total: number | null,
  count: number,
  limit: number,
  offset: number,
): ListMeta => {
  const next = offset + limit;
  const hasMore = total === null ? count >= limit : next < total;

  return { total, limit, offset, nextOffset: hasMore ? next : null };
};

export const toDownload = (file: MaintenanceReadFile): StreamableFile =>
  new StreamableFile(file.data, {
    type: safeContentType(file.contentType),
    disposition: attachmentDisposition(file.fileName),
    length: file.data.length,
  });

const RANGE_LABELS: Record<string, string> = {
  opened: 'Apertura',
  planned: 'Inicio previsto',
  started: 'Inicio real',
  ended: 'Fin real',
  due: 'Vencimiento',
};

/** Documenta los pares `<nombre>From`/`<nombre>To` como rangos `[desde, hasta)`. */
export const ApiRangeQueries = (...names: string[]) =>
  applyDecorators(
    ...names.flatMap((name) => [
      ApiQuery({
        name: `${name}From`,
        required: false,
        description: `${RANGE_LABELS[name]} desde, incluido (ISO 8601 con zona)`,
        example: '2026-11-16T00:00:00-05:00',
      }),
      ApiQuery({
        name: `${name}To`,
        required: false,
        description: `${RANGE_LABELS[name]} hasta, excluido (ISO 8601 con zona)`,
        example: '2026-11-17T00:00:00-05:00',
      }),
    ]),
  );

const intQuery = (name: string) =>
  ApiQuery({
    name,
    required: false,
    schema: { type: 'integer', minimum: 1 },
  });

export const ApiIntQueries = (...names: string[]) =>
  applyDecorators(...names.map(intQuery));

/** Parámetros comunes de los listados. */
export const ApiCommonListQueries = () =>
  applyDecorators(
    ApiQuery({
      name: 'assigned',
      required: false,
      description:
        'Con cesionario (true) o sin él (false); false no admite employeeId',
      schema: { type: 'boolean' },
    }),
    ApiIntQueries('employeeId', 'teamId', 'buildingId'),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      schema: { type: 'integer', minimum: 0, default: 0 },
    }),
  );
