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
import type {
  PreventiveReadDetail,
  PreventiveReadFilters,
  PreventiveReadItem,
} from '../maintenance-supervision/maintenance-integration.types';
import { MaintenanceReadService } from '../maintenance-supervision/maintenance-read.service';
import { VALID_PM_STATUSES } from '../preventive-maintenance/constants/preventive-maint.constants';
import { ListPreventivesQueryDto } from './dto/list-preventives-query.dto';
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
@Controller('integrations/v1/preventives')
export class PreventivesApiController {
  constructor(
    private readonly reader: MaintenanceReadService,
    private readonly cache: MaintenanceCacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar preventivos, el más nuevo primero' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: VALID_PM_STATUSES,
    description: 'Un solo valor',
  })
  @ApiIntQueries('assetId', 'planId')
  @ApiRangeQueries('opened', 'planned', 'due', 'started', 'ended')
  @ApiCommonListQueries()
  async list(
    @Query(strictQuery(ListPreventivesQueryDto)) query: Record<string, any>,
  ): Promise<{ data: PreventiveReadItem[]; meta: ListMeta }> {
    const filters = normalizeInstants({
      ...(query as ListPreventivesQueryDto),
    }) as PreventiveReadFilters;
    const { limit, offset } = filters;

    const { items, total } = await this.cache.getOrLoad(
      `preventives:list:${JSON.stringify(filters)}`,
      () => this.reader.list('preventive', filters),
    );

    return {
      data: items as PreventiveReadItem[],
      meta: toMeta(total, items.length, limit, offset),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ficha completa de un preventivo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 404, description: 'El preventivo no existe.' })
  async detail(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
  ): Promise<{ data: PreventiveReadDetail }> {
    const data = await this.cache.getOrLoad(
      `preventives:detail:${id as number}`,
      () => this.reader.detail('preventive', id as number),
    );

    return { data: data as PreventiveReadDetail };
  }

  @Get(':id/attachments/:attachmentId')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Descargar un archivo del preventivo' })
  @ApiParam({ name: 'id', type: Number })
  @ApiProduces('image/jpeg', 'image/png', 'application/octet-stream')
  @ApiResponse({
    status: 404,
    description: 'No existe o no es del preventivo.',
  })
  async attachment(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Param('attachmentId', FileIdPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    return toDownload(
      await this.reader.attachment('preventive', id as number, attachmentId),
    );
  }
}
