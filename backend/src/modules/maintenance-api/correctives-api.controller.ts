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
} from '@nestjs/swagger';
import { IntegrationsApiDocs } from '../integrations-api/decorators/integrations-api-docs.decorator';
import { EmptyQueryDto } from '../integrations-api/dto/empty-query.dto';
import { MaintenanceApiKeyGuard } from '../integrations-api/guards/maintenance-api-key.guard';
import { MaintenanceCacheService } from '../integrations-api/maintenance-cache.service';
import { FileIdPipe } from '../integrations-api/pipes/file-id.pipe';
import { PositiveIntPipe } from '../integrations-api/pipes/positive-int.pipe';
import { strictQuery } from '../integrations-api/pipes/strict-query.pipe';
import {
  CORRECTIVE_PRIORITIES,
  type CorrectiveReadDetail,
  type CorrectiveReadFilters,
  type CorrectiveReadItem,
} from '../maintenance-supervision/maintenance-integration.types';
import { MaintenanceReadService } from '../maintenance-supervision/maintenance-read.service';
import {
  CORRECTIVE_STATUSES,
  ListCorrectivesQueryDto,
} from './dto/list-correctives-query.dto';
import {
  ApiCommonListQueries,
  ApiIntQueries,
  ApiRangeQueries,
  type ListMeta,
  normalizeInstants,
  toDownload,
  toMeta,
} from './maintenance-api.util';

// Los ids van como `unknown`: con `number`, el pipe global convierte «1e2» antes que PositiveIntPipe.
@IntegrationsApiDocs('API de mantenimiento')
@UseGuards(MaintenanceApiKeyGuard)
@Controller('integrations/v1/correctives')
export class CorrectivesApiController {
  constructor(
    private readonly reader: MaintenanceReadService,
    private readonly cache: MaintenanceCacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar correctivos, el más nuevo primero' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: CORRECTIVE_STATUSES,
    description:
      'Un solo valor. Assigned: asignado y sin empezar; Execution: ya empezado',
  })
  @ApiQuery({ name: 'priority', required: false, enum: CORRECTIVE_PRIORITIES })
  @ApiIntQueries('unitId', 'categoryId', 'subcategoryId')
  @ApiRangeQueries('opened', 'planned', 'started', 'ended')
  @ApiCommonListQueries()
  async list(
    @Query(strictQuery(ListCorrectivesQueryDto)) query: Record<string, any>,
  ): Promise<{ data: CorrectiveReadItem[]; meta: ListMeta }> {
    const filters = normalizeInstants({
      ...(query as ListCorrectivesQueryDto),
    }) as CorrectiveReadFilters;
    const { limit, offset } = filters;

    const { items, total } = await this.cache.getOrLoad(
      `correctives:list:${JSON.stringify(filters)}`,
      () => this.reader.list('corrective', filters),
    );

    return {
      data: items as CorrectiveReadItem[],
      meta: toMeta(total, items.length, limit, offset),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa de un correctivo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 404, description: 'El correctivo no existe.' })
  async detail(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
  ): Promise<{ data: CorrectiveReadDetail }> {
    const data = await this.cache.getOrLoad(
      `correctives:detail:${id as number}`,
      () => this.reader.detail('corrective', id as number),
    );

    return { data: data as CorrectiveReadDetail };
  }

  @Get(':id/attachments/:attachmentId')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Descargar un archivo del correctivo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiProduces('image/jpeg', 'image/png', 'application/octet-stream')
  @ApiResponse({
    status: 404,
    description: 'No existe o no es del correctivo.',
  })
  async attachment(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Param('attachmentId', FileIdPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    return toDownload(
      await this.reader.attachment('corrective', id as number, attachmentId),
    );
  }
}
