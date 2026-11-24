import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CleaningReadService } from '../cleaning-tasks/cleaning-read.service';
import type {
  CleaningReadDetail,
  CleaningReadFile,
  CleaningReadFilters,
  CleaningReadItem,
} from '../cleaning-tasks/cleaning-read.types';
import { CleaningsCacheService } from './cleanings-cache.service';
import {
  CLEANING_PHASES,
  EmptyQueryDto,
  ListCleaningsQueryDto,
} from './dto/list-cleanings-query.dto';
import { CleaningsApiKeyGuard } from './guards/cleanings-api-key.guard';
import { FileIdPipe } from './pipes/file-id.pipe';
import { PositiveIntPipe } from './pipes/positive-int.pipe';
import { strictQuery } from './pipes/strict-query.pipe';
import {
  attachmentDisposition,
  safeContentType,
} from './utils/download-headers.util';

type ListMeta = {
  total: number | null;
  limit: number;
  offset: number;
  nextOffset: number | null;
};

// En UTC, para que el mismo instante escrito con otro offset comparta caché.
const toUtc = (value?: string) => value && new Date(value).toISOString();

const toFilters = (dto: ListCleaningsQueryDto): CleaningReadFilters => ({
  phase: dto.phase,
  date: dto.date,
  plannedFrom: toUtc(dto.plannedFrom),
  plannedTo: toUtc(dto.plannedTo),
  endedFrom: toUtc(dto.endedFrom),
  endedTo: toUtc(dto.endedTo),
  employeeId: dto.employeeId,
  unitId: dto.unitId,
  limit: dto.limit,
  offset: dto.offset,
});

const toDownload = (file: CleaningReadFile): StreamableFile =>
  new StreamableFile(file.data, {
    type: safeContentType(file.contentType),
    disposition: attachmentDisposition(file.fileName),
    length: file.data.length,
  });

// Los ids van como `unknown`: con `number`, el pipe global convierte «1e2» antes que PositiveIntPipe.
@ApiTags('API de limpiezas')
@ApiSecurity('x-api-key')
@ApiResponse({ status: 400, description: 'Parámetro inválido o desconocido.' })
@ApiResponse({ status: 401, description: 'Clave ausente o inválida.' })
@ApiResponse({ status: 429, description: 'Cupo agotado (Retry-After: 60).' })
@ApiResponse({ status: 502, description: 'Falló la lectura de la fuente.' })
@ApiResponse({ status: 503, description: 'API o sesión no disponible.' })
@ApiResponse({ status: 504, description: 'La fuente no respondió a tiempo.' })
@UseGuards(CleaningsApiKeyGuard)
@Controller('integrations/v1/cleanings')
export class CleaningsApiController {
  constructor(
    private readonly reader: CleaningReadService,
    private readonly cache: CleaningsCacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar limpiezas, la más nueva primero' })
  @ApiQuery({ name: 'phase', required: false, enum: CLEANING_PHASES })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Día de generación (YYYY-MM-DD)',
    example: '2026-04-16',
  })
  @ApiQuery({
    name: 'plannedFrom',
    required: false,
    description: 'Inicio planeado desde, incluido (ISO 8601 con zona)',
    example: '2026-11-16T00:00:00-05:00',
  })
  @ApiQuery({
    name: 'plannedTo',
    required: false,
    description: 'Inicio planeado hasta, excluido (ISO 8601 con zona)',
    example: '2026-11-17T00:00:00-05:00',
  })
  @ApiQuery({
    name: 'endedFrom',
    required: false,
    description: 'Fin real desde, incluido (ISO 8601 con zona)',
    example: '2026-11-16T05:00:00Z',
  })
  @ApiQuery({
    name: 'endedTo',
    required: false,
    description: 'Fin real hasta, excluido (ISO 8601 con zona)',
    example: '2026-11-17T05:00:00Z',
  })
  @ApiQuery({
    name: 'employeeId',
    required: false,
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'unitId',
    required: false,
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    schema: { type: 'integer', minimum: 0, default: 0 },
  })
  async list(
    @Query(strictQuery(ListCleaningsQueryDto)) query: Record<string, any>,
  ): Promise<{ data: CleaningReadItem[]; meta: ListMeta }> {
    const filters = toFilters(query as ListCleaningsQueryDto);
    const { limit, offset } = filters;

    const { items, total } = await this.cache.getOrLoad(
      `list:${JSON.stringify(filters)}`,
      () => this.reader.list(filters),
    );

    const next = offset + limit;
    const hasMore = total === null ? items.length >= limit : next < total;

    return {
      data: items,
      meta: { total, limit, offset, nextOffset: hasMore ? next : null },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa de una limpieza' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 404, description: 'La limpieza no existe.' })
  async detail(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
  ): Promise<{ data: CleaningReadDetail }> {
    const data = await this.cache.getOrLoad(`detail:${id as number}`, () =>
      this.reader.detail(id as number),
    );

    return { data };
  }

  @Get(':id/attachments/:attachmentId')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Descargar un archivo de la limpieza' })
  @ApiParam({ name: 'id', type: Number })
  @ApiProduces('image/jpeg', 'image/png', 'application/octet-stream')
  @ApiResponse({
    status: 404,
    description: 'No existe o no es de la limpieza.',
  })
  async attachment(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Param('attachmentId', FileIdPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    return toDownload(await this.reader.attachment(id as number, attachmentId));
  }

  @Get(':id/supervisions/:supervisionId/findings/:findingId/photos/:photoId')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Descargar una foto de una novedad' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'supervisionId', type: Number })
  @ApiParam({ name: 'findingId', type: Number })
  @ApiProduces('image/jpeg', 'image/png', 'application/octet-stream')
  @ApiResponse({
    status: 404,
    description: 'No existe o no es de la limpieza.',
  })
  async findingPhoto(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Param('supervisionId', PositiveIntPipe) supervisionId: unknown,
    @Param('findingId', PositiveIntPipe) findingId: unknown,
    @Param('photoId', FileIdPipe) photoId: string,
  ): Promise<StreamableFile> {
    return toDownload(
      await this.reader.findingPhoto(
        id as number,
        supervisionId as number,
        findingId as number,
        photoId,
      ),
    );
  }
}
